// Keyboard shortcut: / focuses search
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
    e.preventDefault();
    document.getElementById("searchInput")?.focus();
  }
});

// Hero search → live filter + scroll
document.addEventListener("DOMContentLoaded", () => {
  const heroInput = document.getElementById("heroSearchInput");
  const navInput  = document.getElementById("searchInput");
  if (!heroInput) return;

  heroInput.addEventListener("input", () => {
    if (navInput) navInput.value = heroInput.value;
    window.dispatchEvent(new CustomEvent("heroSearch", { detail: heroInput.value }));
  });

  heroInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && heroInput.value.trim()) {
      document.getElementById("models-section")?.scrollIntoView({ behavior: "smooth" });
    }
  });
});
