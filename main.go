// sqapi: HTTP API for SQ mixer preamp control (phantom, pad, gain) over TCP 51326.
package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

//go:embed static
var staticFS embed.FS

const (
	sqPort   = "51326" // SQ mixer TCP port
	httpPort = "8080"
)

var (
	subFS     fs.FS
	indexHTML []byte
)

func init() {
	var err error
	subFS, err = fs.Sub(staticFS, "static")
	if err != nil {
		log.Fatalf("sqapi: embed static: %v", err)
	}
	indexHTML, err = fs.ReadFile(subFS, "index.html")
	if err != nil {
		log.Fatalf("sqapi: embed index: %v", err)
	}
}

func main() {
	sqip, _, err := LoadConfig()
	if err != nil {
		log.Printf("sqapi: load config: %v", err)
	} else {
		if sqip != "" {
			log.Printf("sqapi: SQ IP %s", sqip)
		} else {
			log.Printf("sqapi: SQ IP (not set)")
		}
	}
	if err := LoadState(); err != nil {
		log.Printf("sqapi: load state: %v", err)
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.GET("/", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})
	// Serve /static/* from embed without redirects (no trailing-slash redirect from FileServer)
	r.GET("/static/*path", func(c *gin.Context) {
		name := strings.TrimPrefix(c.Param("path"), "/")
		if name == "" || strings.Contains(name, "..") {
			c.Status(http.StatusNotFound)
			return
		}
		name = path.Clean(name)
		if strings.HasPrefix(name, "..") {
			c.Status(http.StatusNotFound)
			return
		}
		b, err := fs.ReadFile(subFS, name)
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		ct := "application/octet-stream"
		switch {
		case strings.HasSuffix(name, ".html"):
			ct = "text/html; charset=utf-8"
		case strings.HasSuffix(name, ".css"):
			ct = "text/css"
		case strings.HasSuffix(name, ".js"):
			ct = "application/javascript"
		case strings.HasSuffix(name, ".json"):
			ct = "application/json"
		case strings.HasSuffix(name, ".ico"):
			ct = "image/x-icon"
		}
		c.Data(http.StatusOK, ct, b)
	})

	r.GET("/api/config", handleGetConfig)
	r.POST("/api/config", handlePostConfig)
	r.GET("/api/state", handleGetState)
	r.POST("/api/state", handlePostState)
	r.POST("/api/state/reset", handleResetState)

	getAddr := makeGetAddr(sqPort)
	r.POST("/api/sync", handlePostSync(getAddr))
	r.GET("/api/sync/status", handleGetSyncStatus)

	r.GET("/api/shows", handleGetShows)
	r.GET("/api/shows/:name", handleGetShow)
	r.POST("/api/shows", handlePostShow)
	r.DELETE("/api/shows/:name", handleDeleteShow)

	r.POST("/preamp/local/:id/phantom", func(c *gin.Context) { runPreampBool(c, getAddr, "local", parseLocalPreampID, buildPhantom, "phantom") })
	r.POST("/preamp/local/:id/pad", func(c *gin.Context) { runPreampBool(c, getAddr, "local", parseLocalPreampID, buildPad, "pad") })
	r.POST("/preamp/local/:id/gain", func(c *gin.Context) { runPreampGain(c, getAddr, "local", parseLocalPreampID, buildGain) })
	r.POST("/preamp/slink/:id/phantom", func(c *gin.Context) {
		runPreampBool(c, getAddr, "slink", parseSLinkPreampID, buildPhantomSLink, "phantom")
	})
	r.POST("/preamp/slink/:id/pad", func(c *gin.Context) { runPreampBool(c, getAddr, "slink", parseSLinkPreampID, buildPadSLink, "pad") })
	r.POST("/preamp/slink/:id/gain", func(c *gin.Context) { runPreampGain(c, getAddr, "slink", parseSLinkPreampID, buildGainSLink) })

	log.Printf("sqapi: %s%s", "http://localhost:", httpPort)
	log.Fatal(r.Run(":" + httpPort))
}
