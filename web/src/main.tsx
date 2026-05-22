import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { Toaster } from "@/components/ui/sonner";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Toaster richColors position="top-right" />
  </React.StrictMode>,
);
