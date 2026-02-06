// sqapi: HTTP API for SQ mixer preamp control (phantom, pad, gain) over TCP 51326.
package main

import (
	"log"
	"os"

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

	r.GET("/api/config", handleGetConfig)
	r.POST("/api/config", handlePostConfig)
	r.GET("/api/shows", handleGetShows)
	r.GET("/api/shows/:name", handleGetShow)
	r.POST("/api/shows", handlePostShow)

	getAddr := makeGetAddr(sqPort)
	r.POST("/preamp/local/:id/phantom", func(c *gin.Context) { runPreampBool(c, getAddr, parseLocalPreampID, buildPhantom, "phantom") })
	r.POST("/preamp/local/:id/pad", func(c *gin.Context) { runPreampBool(c, getAddr, parseLocalPreampID, buildPad, "pad") })
	r.POST("/preamp/local/:id/gain", func(c *gin.Context) { runPreampGain(c, getAddr, parseLocalPreampID, buildGain) })
	r.POST("/preamp/slink/:id/phantom", func(c *gin.Context) { runPreampBool(c, getAddr, parseSLinkPreampID, buildPhantomSLink, "phantom") })
	r.POST("/preamp/slink/:id/pad", func(c *gin.Context) { runPreampBool(c, getAddr, parseSLinkPreampID, buildPadSLink, "pad") })
	r.POST("/preamp/slink/:id/gain", func(c *gin.Context) { runPreampGain(c, getAddr, parseSLinkPreampID, buildGainSLink) })

	if defaultSQIP != "" {
		log.Printf("sqapi: SQ=%s (env), HTTP :%s", defaultSQIP+":"+sqPort, httpPort)
	} else {
		log.Printf("sqapi: SQ IP configból, HTTP :%s", httpPort)
	}
	log.Fatal(r.Run(":" + httpPort))
}
