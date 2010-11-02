Podcast Tracker
===============

A simple analytics utility that tracks the number of times that a file, specifically for my use-case MP3s and OGG audio files, are requested for download. The tracking is done upon the request for the most accurate determination of impressions for any given episode. It streams the requested file either from the filesystem or from another HTTP server (AWS S3 works perfect for this). 

There are two utility "views" for this application, the statistics view and the reset view. Statistics view will present all of the files requested and a breakdown of their respective file formats. Grouping for the statistics is done by adhering to the following file structure:

_podcastshortname_-_datestamp_._format_

The provided reset view resets all of the statistics. For obvious security reasons both paths should be placed behind an authentication (http basic authentication by a fronting server works perfectly fine) OR at the very least, you need to come up with creative URIs that can be specified in the config file. 

The configuration file (config.js) must be present, a template of which is provided. You must provide headers in the format of 

{_podcastshortname_: _podcastlongname_}

Multiple can be provided. The location field of the configuration can specify a file path relative to the server.js file OR a HTTP URL.

Dependencies
------

Requires node.js to be installed with the following packages installed, all of which are available via NPM:

  * paperboy - only if using file serving functionality (not http streaming)
  * jade
  * redis

Also it requires a [Redis](http://code.google.com/p/redis/) instance to be installed locally.

Gratis
------

If you like or use this, please tune into [A Minute With Brendan](http://aminutewithbrendan.com) or [JSConf Live](http://jsconflive.com) and say nice things on Twitter about them :)