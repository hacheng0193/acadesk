"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "./ui";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private browsing: the theme just won't persist.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={buttonClass({ variant: "ghost", size: "icon" })}
      aria-label="切換深淺色"
      title="切換深淺色"
    >
      {dark ? "☀" : "☾"}
    </button>
  );
}
