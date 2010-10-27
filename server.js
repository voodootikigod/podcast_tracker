var paperboy = require('paperboy');
var path = require("path");
var url = require("url");
var sys = require("sys");
var redis = require("redis");
var config = require("./config");
var jade = require("jade");
var http = require("http");

paperboy.contentTypes["mp3"] = "audio/mpeg";
paperboy.contentTypes["ogg"] = "audio/ogg";

var client = redis.createClient();
var local_streaming = !(/^http/.exec(config.location));      // if location begins with http, not local streaming.
var fileServer;
var parsed_url;
var log = console.log;


if (local_streaming) {
  file_root = config.location;
} else { 
  parsed_url = url.parse(config.location);
}


function track_delivery(url) {
  
  if (/[a-z]+\-[0-9]{8}\.(mp3|ogg)$/.exec(url)) {
    file_parts = url.split("/");
    filename = file_parts[file_parts.length-1];
    
    // track specific format of release
    client.incr("podcast:"+filename);
    
    // track of specific release
    client.incr("podcast:"+filename.split(".")[0]);
    
    // track podcast count
    client.incr("podcast:"+filename.split("-")[0]);
  }
}


//files must maintain format {DIR}/{PODCAST_HEADER_HANDLE}_{DATE}.{FORMAT}

require('http').createServer(function (request, response) {
    request.addListener('end', function () {
      var url = request.url;
      if (url == "/") {
        response.writeHead(301, {"Location": config.redirect});
        response.end();
      } else if (url == "/statistics")  {
            client.keys("podcast:*", function (err, res) {
                var length = res.length, count = 0, results = {};
                config.headers.forEach(function(header) {
                    results[header] = {
                        title: config.headers[header],
                        total: 0,
                        data: []
                    };
                });
                // populate data
                res.forEach(function (item) {
                    var episode = item.replace("podcast:", "");
                    client.get(item, function (err, resp) {
                        var value = parseInt(resp.toString('utf8'));
                        if (config.headers[episode]) {
                            results[episode]["total"] = value;
                        } else {
                            var parts = episode.split("_");
                            var ep = parts[0];
                            var back_parts = parts[1].split(".");
                            var date = back_parts[0];
                            var ext = back_parts[1];
                            if (typeof results[ep][date] === 'undefined') {
                                results[ep][date] = {};
                            }
                            if (typeof ext === 'undefined') {
                                results[ep][date]["total"] = value;
                            } else {
                                results[ep][date][ext] = value;
                            }
                        }
                        count += 1
                        if (count == length) { 
                          jade.renderFile('index.jade', results, function(err, html){
                            response.writeHead(200, {"Content-Type": "text/html"});
                            response.end(html);
                          });
                        }
                    });
                })
            })
        } else {
          if (local_streaming) {
            (function (purl, ip) {
              paperboy.deliver(file_root, request, response)
                .addHeader("Accept-Range", "bytes")
                // .addHeader("Content-Type", contenttype)
                .before(function() { 
                  track_delivery(purl); return true; })
                .after(function(statCode) {
                  log(statCode, purl, ip);
                })
                .error(function(statCode, msg) {
                  response.writeHead(statCode, {'Content-Type': 'text/plain'});
                  response.end("Error " + statCode);
                  log(statCode, purl, ip, msg);
                })
                .otherwise(function(err) {
                  response.writeHead(404, {'Content-Type': 'text/plain'});
                  response.end("Error 404: File not found");
                  log(404, purl, ip, err);
                });
            })(url,request.connection.remoteAddress);
          } else {

            var proxy = http.createClient(parsed_url.port || 80, parsed_url.hostname)
            
              var proxy_request = proxy.request(request.method, request.url, request.headers);
              proxy_request.addListener('response', function (proxy_response) {
                proxy_response.addListener('data', function(chunk) {
                  response.write(chunk, 'binary');
                });
                proxy_response.addListener('end', function() {
                  response.end();
                });
                if (proxy_response.statusCode == 200) {
                  track_delivery(url);
                }
                response.writeHead(proxy_response.statusCode, proxy_response.headers);
              });
              request.addListener('data', function(chunk) {
                proxy_request.write(chunk, 'binary');
              });
              request.addListener('end', function() {
                proxy_request.end();
              });
          }
        }
    });
}).listen(config.port);