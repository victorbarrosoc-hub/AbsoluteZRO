// YouTube IFrame API falsa (só e2e): o mesmo contrato que o player usa, sem rede. O tempo começa em 7 s.
(function () {
  window.YT = {
    Player: function (el, o) {
      var t = 7;
      var tocando = false;
      var d = document.createElement("div");
      d.className = "yt-falso";
      d.textContent = "YouTube falso " + o.videoId;
      d.style.cssText = "width:100%;height:100%;display:grid;place-items:center;background:#2a0b0b;color:#fff";
      el.replaceWith(d);
      this.playVideo = function () {
        tocando = true;
        o.events.onStateChange({ data: 1 });
      };
      this.pauseVideo = function () {
        tocando = false;
        o.events.onStateChange({ data: 2 });
      };
      this.seekTo = function (s) {
        t = s;
      };
      this.getCurrentTime = function () {
        return t;
      };
      this.getDuration = function () {
        return 60;
      };
      this.getPlayerState = function () {
        return tocando ? 1 : 2;
      };
      this.destroy = function () {};
      setTimeout(function () {
        o.events.onReady({ target: null });
      }, 10);
    },
  };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
