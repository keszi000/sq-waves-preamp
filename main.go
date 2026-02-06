// sqapi: HTTP API (Gin) → SQ pult (TCP 51326). Phantom, pad, gain.
//   Local preamps: 1–16 input, 17 = talkback (Local Preamp). S-Link preamps: TBD (reverse-engineer).
//
//   SQ_IP=10.10.10.170 go run .
//   curl -X POST "http://localhost:8080/preamp/local/1/phantom?on=true"
//   curl -X POST "http://localhost:8080/preamp/local/1/pad?on=false"
//   curl -X POST "http://localhost:8080/preamp/local/1/gain" -H "Content-Type: application/json" -d '{"db": 12}'
//   curl -X POST "http://localhost:8080/preamp/local/17/gain" -d 'db=30'
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const defaultPort = "51326"

func main() {
	defaultSQIP := os.Getenv("SQ_IP")
	sqPort := os.Getenv("SQ_PORT")
	if sqPort == "" {
		sqPort = defaultPort
	}

	httpPort := os.Getenv("PORT")
	if httpPort == "" {
		httpPort = "8080"
	}

	r := gin.Default()
	r.GET("/", func(c *gin.Context) { c.File("./static/index.html") })
	r.Static("/static", "./static")

	// API: config (last SQ IP)
	r.GET("/api/config", func(c *gin.Context) {
		sqip, err := LoadConfig()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"sq_ip": sqip})
	})
	r.POST("/api/config", func(c *gin.Context) {
		var body struct {
			SQIP string `json:"sq_ip"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := SaveConfig(body.SQIP); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"sq_ip": strings.TrimSpace(body.SQIP)})
	})

	// API: shows (save/load on server)
	r.GET("/api/shows", func(c *gin.Context) {
		names, err := ListShows()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"shows": names})
	})
	r.GET("/api/shows/:name", func(c *gin.Context) {
		b, err := GetShow(c.Param("name"))
		if err != nil {
			if os.IsNotExist(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "show not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Data(http.StatusOK, "application/json", b)
	})
	r.POST("/api/shows", func(c *gin.Context) {
		var body struct {
			Name  string        `json:"name"`
			Cubes []interface{} `json:"cubes"`
			SqIP  string        `json:"sq_ip"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		name := sanitizeShowName(body.Name)
		if name == "" {
			name = "show"
		}
		body.Name = name
		b, _ := json.MarshalIndent(body, "", "  ")
		if err := SaveShow(name, b); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"name": name})
	})

	getAddr := func(c *gin.Context) (string, bool) {
		ip := c.GetHeader("X-SQ-IP")
		if ip == "" {
			ip = defaultSQIP
		}
		if ip == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "SQ IP nincs megadva: írd be a frontenden vagy állítsd SQ_IP env-et"})
			return "", false
		}
		return ip + ":" + sqPort, true
	}

	// Local preamp: 1–16 input, 17 = talkback (Local Preamp). Sends to SQ TCP.
	r.POST("/preamp/local/:id/phantom", func(c *gin.Context) {
		addr, ok := getAddr(c)
		if !ok {
			return
		}
		preamp, ok := parseLocalPreampID(c, c.Param("id"))
		if !ok {
			return
		}
		on := c.Query("on") == "true" || c.Query("on") == "1"
		if err := sendToSQ(addr, buildPhantom(preamp, on)); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"preamp": preamp, "phantom": on})
	})

	r.POST("/preamp/local/:id/pad", func(c *gin.Context) {
		addr, ok := getAddr(c)
		if !ok {
			return
		}
		preamp, ok := parseLocalPreampID(c, c.Param("id"))
		if !ok {
			return
		}
		on := c.Query("on") == "true" || c.Query("on") == "1"
		if err := sendToSQ(addr, buildPad(preamp, on)); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"preamp": preamp, "pad": on})
	})

	r.POST("/preamp/local/:id/gain", func(c *gin.Context) {
		addr, ok := getAddr(c)
		if !ok {
			return
		}
		preamp, ok := parseLocalPreampID(c, c.Param("id"))
		if !ok {
			return
		}
		var body struct {
			DB float64 `json:"db"`
		}
		if c.ContentType() == "application/json" {
			if err := c.ShouldBindJSON(&body); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json, need {\"db\": 0..60}"})
				return
			}
		} else {
			dbStr := c.PostForm("db")
			if dbStr == "" {
				dbStr = c.Query("db")
			}
			if dbStr == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "missing db (0..60), query ?db=12 or JSON {\"db\": 12}"})
				return
			}
			var err error
			body.DB, err = strconv.ParseFloat(dbStr, 64)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "db must be number 0..60"})
				return
			}
		}
		if body.DB < 0 || body.DB > 60 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "db must be 0..60"})
			return
		}
		if err := sendToSQ(addr, buildGain(preamp, body.DB)); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"preamp": preamp, "gain_db": body.DB})
	})

	// S-Link preamps: placeholder until reverse-engineered (e.g. preamp 1–40).
	r.POST("/preamp/slink/:id/phantom", func(c *gin.Context) {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "S-Link preamp not implemented yet"})
	})
	r.POST("/preamp/slink/:id/pad", func(c *gin.Context) {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "S-Link preamp not implemented yet"})
	})
	r.POST("/preamp/slink/:id/gain", func(c *gin.Context) {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "S-Link preamp not implemented yet"})
	})

	if defaultSQIP != "" {
		log.Printf("sqapi: SQ=%s (default), HTTP :%s", defaultSQIP+":"+sqPort, httpPort)
	} else {
		log.Printf("sqapi: SQ IP a frontendről (X-SQ-IP), HTTP :%s", httpPort)
	}
	log.Fatal(r.Run(":" + httpPort))
}

// parseLocalPreampID: local preamp 1–16 (input) or 17 (talkback). Returns false and writes error on invalid.
func parseLocalPreampID(c *gin.Context, id string) (int, bool) {
	n, err := strconv.Atoi(id)
	if err != nil || n < 1 || n > 17 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "local preamp must be 1–16 (input) or 17 (talkback)"})
		return 0, false
	}
	return n, true
}
