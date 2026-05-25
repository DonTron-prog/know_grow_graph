import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { createApiClient, normalizeApiBaseUrl } from "./api.js";
import "./styles.css";

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Frontend root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App apiClient={createApiClient(apiBaseUrl)} />
  </StrictMode>
);
