"use strict";

(function () {
  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // Theme selection still applies for this page when storage is unavailable.
    }
  }

  function setTheme(theme) {
    var isDark = theme === "dark";
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute("content", isDark ? "#171b1f" : "#fbfbfa");
    }
    var button = document.getElementById("dark-mode");
    if (button) {
      button.setAttribute("aria-pressed", isDark ? "true" : "false");
      button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
      button.textContent = "Theme";
    }
  }

  function initTheme() {
    setTheme(storageGet("theme") === "dark" ? "dark" : "light");
    var button = document.getElementById("dark-mode");
    if (button) {
      button.addEventListener("click", function () {
        var nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        storageSet("theme", nextTheme);
        setTheme(nextTheme);
      });
    }
  }

  function initCurrentNavigation() {
    var currentPath = window.location.pathname.replace(/\/$/, "") || "/";
    document.querySelectorAll("[data-nav-link]").forEach(function (link) {
      try {
        var linkPath = new URL(link.href, window.location.href).pathname.replace(/\/$/, "") || "/";
        if (linkPath === currentPath) {
          link.setAttribute("aria-current", "page");
        }
      } catch (error) {
        // A malformed optional navigation item should not break the rest of the site.
      }
    });
  }

  function plainText(value) {
    var element = document.createElement("div");
    element.innerHTML = value || "";
    return (element.textContent || element.innerText || "").replace(/\s+/g, " ").trim();
  }

  function makeTeaser(body) {
    var text = plainText(body);
    if (text.length <= 240) {
      return text;
    }
    return text.substring(0, 237).replace(/\s+\S*$/, "") + "…";
  }

  function searchResults(index, term, target) {
    target.innerHTML = "";
    if (!term) {
      return;
    }

    if (!index) {
      var unavailable = document.createElement("p");
      unavailable.className = "search-results__empty";
      unavailable.textContent = "Search is unavailable on this page.";
      target.appendChild(unavailable);
      return;
    }

    var results = index.search(term, {
      bool: "AND",
      fields: {
        title: { boost: 2 },
        body: { boost: 1 }
      }
    });

    if (results.length === 0) {
      var empty = document.createElement("p");
      empty.className = "search-results__empty";
      empty.textContent = "No results.";
      target.appendChild(empty);
      return;
    }

    results.slice(0, 10).forEach(function (result) {
      var item = document.createElement("article");
      item.className = "search-result";

      var heading = document.createElement("h3");
      var link = document.createElement("a");
      link.href = result.ref;
      link.textContent = result.doc.title;
      heading.appendChild(link);
      item.appendChild(heading);

      var excerpt = document.createElement("p");
      excerpt.textContent = makeTeaser(result.doc.body);
      item.appendChild(excerpt);
      target.appendChild(item);
    });
  }

  function initSearch() {
    var openButton = document.getElementById("nav-search");
    var modal = document.getElementById("search-modal");
    var input = document.getElementById("search");
    var resultsTarget = document.querySelector(".search-results__items");
    if (!openButton || !modal || !input || !resultsTarget) {
      return;
    }

    var index = null;
    if (window.elasticlunr && window.searchIndex) {
      index = window.elasticlunr.Index.load(window.searchIndex);
    }
    var lastFocus = null;
    var previousOverflow = "";
    var backgroundState = [];

    function focusableElements() {
      return Array.prototype.slice.call(modal.querySelectorAll(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )).filter(function (element) {
        return !element.hidden && element.getClientRects().length > 0;
      });
    }

    function setBackgroundInert(isInert) {
      if (isInert) {
        backgroundState = [];
        Array.prototype.forEach.call(document.body.children, function (element) {
          if (element === modal) {
            return;
          }
          backgroundState.push({
            element: element,
            inert: element.inert,
            ariaHidden: element.getAttribute("aria-hidden")
          });
          element.inert = true;
          element.setAttribute("aria-hidden", "true");
        });
        return;
      }

      backgroundState.forEach(function (state) {
        state.element.inert = state.inert;
        if (state.ariaHidden === null) {
          state.element.removeAttribute("aria-hidden");
        } else {
          state.element.setAttribute("aria-hidden", state.ariaHidden);
        }
      });
      backgroundState = [];
    }

    function restoreFocus(element) {
      if (!element || typeof element.focus !== "function") {
        return;
      }
      try {
        element.focus({ preventScroll: true });
      } catch (error) {
        element.focus();
      }
    }

    function closeSearch() {
      if (modal.hidden) {
        return;
      }
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.documentElement.style.overflow = previousOverflow;
      setBackgroundInert(false);
      var focusTarget = lastFocus;
      lastFocus = null;
      restoreFocus(focusTarget);
    }

    function openSearch() {
      if (!modal.hidden) {
        return;
      }
      lastFocus = document.activeElement;
      previousOverflow = document.documentElement.style.overflow;
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      setBackgroundInert(true);
      document.documentElement.style.overflow = "hidden";
      input.focus();
      input.select();
    }

    function trapFocus(event) {
      if (modal.hidden || event.key !== "Tab") {
        return;
      }
      var focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      var active = document.activeElement;
      if (!modal.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function enforceFocus(event) {
      if (!modal.hidden && !modal.contains(event.target)) {
        var focusable = focusableElements();
        restoreFocus(focusable[0] || input);
      }
    }

    openButton.addEventListener("click", openSearch);
    modal.querySelectorAll("[data-search-close]").forEach(function (closeButton) {
      closeButton.addEventListener("click", closeSearch);
    });
    document.addEventListener("keydown", function (event) {
      if (modal.hidden) {
        return;
      }
      if (event.key === "Escape") {
        closeSearch();
        return;
      }
      trapFocus(event);
    });
    document.addEventListener("focusin", enforceFocus);
    input.addEventListener("input", function () {
      searchResults(index, input.value.trim(), resultsTarget);
    });
  }

  function initOptionalFeatures() {
    if (typeof mermaid !== "undefined" && typeof mermaid.initialize === "function") {
      mermaid.initialize({ startOnLoad: true });
    }

    if (typeof chartXkcd !== "undefined") {
      document.querySelectorAll(".chart").forEach(function (element, index) {
        element.setAttribute("id", "chart-" + index);
        var chart = JSON.parse(element.textContent);
        var type = chart.type;
        delete chart.type;
        new chartXkcd[type](element, chart);
      });
    }

    if (typeof Galleria !== "undefined") {
      document.querySelectorAll(".galleria").forEach(function (element, index) {
        element.setAttribute("id", "galleria-" + index);
        var data = JSON.parse(element.textContent);
        data.images.forEach(function (image) {
          var link = document.createElement("a");
          link.href = image.src;
          var imageElement = document.createElement("img");
          imageElement.src = image.src;
          imageElement.alt = image.title || "";
          imageElement.dataset.title = image.title || "";
          imageElement.dataset.description = image.description || "";
          link.appendChild(imageElement);
          element.appendChild(link);
        });
        Galleria.run("#galleria-" + index, { transition: "none" });
        element.querySelectorAll("*").forEach(function (child) {
          child.style.setProperty("transition", "none", "important");
          child.style.setProperty("animation", "none", "important");
        });
      });
    }

    if (typeof mapboxgl !== "undefined") {
      document.querySelectorAll(".map").forEach(function (element, index) {
        element.setAttribute("id", "map-" + index);
        mapboxgl.accessToken = element.querySelector(".mapbox-access-token").textContent.trim();
        var zoom = element.querySelector(".mapbox-zoom").textContent.trim();
        var map = new mapboxgl.Map({
          container: "map-" + index,
          style: "mapbox://styles/mapbox/light-v10",
          center: [-96, 37.8],
          zoom: zoom
        });
        map.addControl(new mapboxgl.NavigationControl());
        var geojson = JSON.parse(element.querySelector(".mapbox-geojson").textContent.trim());
        var center = [0, 0];
        geojson.features.forEach(function (marker) {
          center[0] += marker.geometry.coordinates[0];
          center[1] += marker.geometry.coordinates[1];
          new mapboxgl.Marker()
            .setLngLat(marker.geometry.coordinates)
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
              "<h3>" + marker.properties.title + "</h3><p>" + marker.properties.description + "</p>"
            ))
            .addTo(map);
        });
        if (geojson.features.length) {
          center[0] /= geojson.features.length;
          center[1] /= geojson.features.length;
          map.setCenter(center);
        }
      });
    }

    if (typeof renderMathInElement !== "undefined") {
      renderMathInElement(document.body, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true }
        ]
      });
    }
  }

  function ready() {
    initTheme();
    initCurrentNavigation();
    initSearch();
    initOptionalFeatures();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
}());
