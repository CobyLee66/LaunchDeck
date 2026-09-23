import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initLanguage } from "./i18n";
import "./styles.css";

// 先确定语言再渲染，避免首帧语言与偏好不一致；语言初始化失败也照常渲染
initLanguage().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
