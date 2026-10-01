export function currentRoute() {
  const path = window.location.hash.replace(/^#\/?/, "") || "home";
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "pace" && parts[1] === "students" && parts[2]) return { page: "student-detail", student: decodeURIComponent(parts.slice(2).join("/")) };
  if (parts[0] === "pace" && parts[1] === "students") return { page: "students" };
  if (parts[0] === "pace" && parts[1] === "activity") return { page: "activity" };
  if (parts[0] === "pace") return { page: "pace" };
  return { page: "home" };
}

export function go(path) { window.location.hash = path.startsWith("#") ? path : `#/${path}`; }
