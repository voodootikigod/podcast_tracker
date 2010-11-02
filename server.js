var paperboy = require('paperboy');
var path = require("path");
var sys = require("sys");
var url = require("url");
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

function rollback(url) {
  
  if (/[a-z]+\-[0-9]{8}\.(mp3|ogg)$/.exec(url)) {
    file_parts = url.split("/");
    filename = file_parts[file_parts.length-1];
    
    // track specific format of release
    client.decr("podcast:"+filename);
    
    // track of specific release
    client.decr("podcast:"+filename.split(".")[0]);
    
    // track podcast count
    client.decr("podcast:"+filename.split("-")[0]);
  }
}



function redirect(response) { 
  response.writeHead(301, {"Location": config.redirect});
  response.end();
}


var is = (function () {
    var records = [];
    return {
        duplicate: function (ip_addr,url) {
            var str = [ip_addr, url].join(":");
            if (records.indexOf(str) >= 0) { 
                return true;
            } else {
                records.push(str);
                while (records.length > 50) { records.pop(); }
                return false;
            }
        }
    }

})();


//files must maintain format {DIR}/{PODCAST_HEADER_HANDLE}_{DATE}.{FORMAT}

require('http').createServer(function (request, response) {
    var target_url = request.url;
    sys.puts("Request: "+target_url);
    request.addListener('end', function () {
      if (target_url == "/") {
        redirect(response);
      } else if (target_url == config.reset_uri) {
        client.keys("podcast:*", function (err, res) {
          if (res != null)
            res.forEach(function (item) { client.del(item) });
          response.writeHead(301, {"Location": config.statistics_uri});
          response.end();
        });
      } else if (target_url == config.statistics_uri)  {
            client.keys("podcast:*", function (err, res) {
              if (typeof res == 'undefined' || res == null) {
                jade.renderFile('empty.jade', {}, function(err, html){
                  response.writeHead(200, {"Content-Type": "text/html"});
                  response.end(html);
                });
              } else {
              
                var length = res.length, count = 0, results = {};
                var episodes = [];
                for (var header in config.headers) {
                    results[header] = {
                        title: config.headers[header],
                        total: 0,
                        data: {}
                    };
                }
                
                
                // populate data
                res.forEach(function (item) {
                    var i = item.toString();
                    var episode = i.replace("podcast:", "");
                    client.get(i, function (err, resp) {
                        var value = parseInt(resp.toString('utf8'));
                        if (config.headers[episode]) {
                            results[episode]["total"] = value;
                        } else {
                            var parts = episode.split("-");
                            var ep = parts[0];
                            var back_parts = parts[1].split(".");
                            var date = back_parts[0];
                            var ext = back_parts[1];
                            if (episodes.indexOf(date) < 0) {
                              episodes.push(date)
                            }
                            if (typeof results[ep]["data"][date] === 'undefined') {
                                results[ep]["data"][date] = {};
                            }
                            if (typeof ext === 'undefined') {
                                results[ep]["data"][date]["total"] = value;
                            } else {
                                results[ep]["data"][date][ext] = value;
                            }
                        }
                        count += 1
                        if (count == length) { 
                          jade.renderFile('index.jade', {locals: {podcasts: results, reset_uri: config.reset_uri, episodes: episodes.sort().reverse(), ordering: ["Total", "MP3", "Ogg"]} }, function(err, html){
                            response.writeHead(200, {"Content-Type": "text/html"});
                            response.end(html);
                          });
                        }
                    });
                })
              }
            })
        } else {
          if (local_streaming) {
            (function (purl, ip) {
              paperboy.deliver(file_root, request, response)
                .addHeader("Accept-Range", "bytes")
                    .before(function() { if (!is.duplicate(ip, purl)) { track_delivery(purl); return true; } })
                .after(function(statCode) { })
                .error(function(statCode, msg) { 
                  rollback(purl);
                  redirect(response); })
                .otherwise(function(err) { 
                  rollback(purl);
                  redirect(response);  
                });
            })(target_url,request.connection.remoteAddress);
          } else {
            var source = http.createClient(parsed_url.port || 80, parsed_url.hostname);
            var req = source.request('GET', target_url, {'host': parsed_url.hostname});
            req.end();
            req.on('response', function (resp) {
              if (resp.statusCode == 200) {
                  if (!is.duplicate(request.connection.remoteAddress, target_url)) {
                      track_delivery(target_url);
                  }
                  headers = resp.headers;
                  headers["Accept-Range"] = "bytes";
                  response.writeHead(resp.statusCode, headers);
                  resp.on('data', function (chunk) { response.write(chunk); });
                  resp.on('end', function () {response.end(); });
              } else {
                  redirect(response);
              }
            });
            
          }
        }
    });
}).listen(config.port);

sys.puts("Server started on port: "+config.port);