var nodestatic = require('node-static');
var sys = require("sys");
var redis = require("redis");
var config = require("./config");
var jade = require("jade");
var http = require("http");



var fileServer = new nodestatic.Server(config.directory);
client = redis.createClient();

require('http').createServer(function (request, response) {
  request.addListener('end', function () {
    var url = request.url;
    if (url == "/") {
      response.writeHead(301, {"Location": config.redirect});
      response.end();
    } else if (url == "/statistics")  {
      client.keys("podcast:*", function (err, res) {
        var length = res.length, count = 0, results = {};
        res.forEach(function (item) { 
          client.get(item, function (err, resp) {
            results[item] = parseInt(resp.toString('utf8'));
            count += 1
            if (count == length) { 
              
              jade.renderFile('index.jade', { headers: config.headers }, function(err, html){
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
          file_parts = url.split("/");
          filename = file_parts[file_parts.length-1];
          if (/(mp3|ogg)$/.exec(url)) {
            client.incr("podcast:"+filename);
            client.incr("podcast:"+filename.split(".")[0]);
          }
        }
      });
    }
  });
}).listen(config.port);