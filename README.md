Support Assets
=================

Screenshots and screencast gifs are often useful to describe activities that would take a lot more effort to describe in words - not to be too trite, but sometimes a picture (or animation) really *is* worth a thousand words.

Files in this project's assets "drawer" are stored here for external reference in places like support.glitch.com and glitch.com/help.

Can also be used to save images of what Support staff are seeing while trying to repro a problem.

### Best Practices
If you add an image to the assets it should be accompanied by a "route" to it in lws.config.js (they're called `rewrite`s there). That will allow us to use simple urls for linking and to keep them updated (but at the same url) when things change.

For some reason that hasn'tr been sorted out yet, sometimes those `rewrite`s don't always play well with S3-stored gifs, so we typically download them to the local `/img` directory and point to them there.

`wget {asset url} -O /img/{filename}` suffices for this.

Likewise if you provide an updated asset it makes sense to update any existing redirects.

Also please name things descriptively so other folks can tell what the heck they're for.

\ ゜o゜)ノ
