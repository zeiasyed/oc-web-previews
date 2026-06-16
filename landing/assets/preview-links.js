(function (global) {
  "use strict";

  function apiBase() {
    return (global.BRANDING && global.BRANDING.outreach_api) || "https://api.inertia-intel.com";
  }

  function dynamicPreviewUrl(slug) {
    return `${apiBase()}/preview/${encodeURIComponent(slug)}/index.html`;
  }

  function staticPreviewUrl(previewPath) {
    return previewPath.startsWith("../") ? previewPath : `../${previewPath}`;
  }

  /** QR postcard previews live on GitHub Pages; voice-outreach previews on the API. */
  function resolvePreviewHref(slug, businesses) {
    if (!slug) return null;
    const match = Array.isArray(businesses) ? businesses.find((b) => b.slug === slug) : null;
    if (match && match.preview_path) return staticPreviewUrl(match.preview_path);
    return dynamicPreviewUrl(slug);
  }

  global.PreviewLinks = {
    resolvePreviewHref,
    dynamicPreviewUrl,
  };
})(window);
