import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

// The claude.ai page build ships without its own <html> tag, so set the language here.
if (!document.documentElement.lang) document.documentElement.lang = "en";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
