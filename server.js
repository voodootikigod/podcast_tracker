var nodestatic = require('node-static');
var sys = require("sys");
var redis = require("redis");
var config = require("./config");
var jade = require("jade");
var http = require("http");



var fileServer = new nodestatic.Server(config.directory);
client = redis.createClient();

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
            fileServer.serve(request, response, function (err, results) {
                if (err && (err.status === 404)) { // If the file wasn't found
                  response.writeHead(301, {"Location": config.redirect});
                  response.end();
                } else { 
                    if (/(mp3|ogg)$/.exec(url)) {
                      file_parts = url.split("/");
                      filename = file_parts[file_parts.length-1];
                        
                        // track specific format of release
                        client.incr("podcast:"+filename);
                        
                        // track of specific release
                        client.incr("podcast:"+filename.split(".")[0]);
                        
                        // track podcast count
                        client.incr("podcast:"+filename.split("_")[0]);
                    }
                    
                }
            });
        }
    });
}).listen(config.port);