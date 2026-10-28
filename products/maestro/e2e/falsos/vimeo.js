// Vimeo Player SDK falso (só e2e): eventos e promessas como o SDK, sem rede. O tempo começa em 4 s.
(function () {
  window.Vimeo = {
    Player: function (el) {
      var h = {};
      var t = 4;
      el.textContent = "Vimeo falso";
      el.style.cssText = "width:100%;height:100%;display:grid;place-items:center;background:#0b1a2a;color:#fff";
      this.on = function (ev, cb) {
        h[ev] = cb;
        if (ev === "loaded")
          setTimeout(function () {
            cb({});
          }, 10);
        if (ev === "timeupdate")
          setTimeout(function () {
            cb({ seconds: t, duration: 30 });
          }, 30);
      };
      this.play = function () {
        if (h.play) h.play({});
        return Promise.resolve();
      };
      this.pause = function () {
        if (h.pause) h.pause({});
        return Promise.resolve();
      };
      this.setCurrentTime = function (s) {
        t = s;
        if (h.seeked) h.seeked({ seconds: s });
        return Promise.resolve(s);
      };
      this.getCurrentTime = function () {
        return Promise.resolve(t);
      };
      this.getDuration = function () {
        return Promise.resolve(30);
      };
      this.getPaused = function () {
        return Promise.resolve(true);
      };
      this.destroy = function () {
        return Promise.resolve();
      };
    },
  };
})();
