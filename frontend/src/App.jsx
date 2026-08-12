import React from "react";
import Chat from "./components/Chat.jsx";
import "./App.css";

function App() {
  return (
    <div className="app">
      <h1>RAG Chatbot</h1>
      <p className="subtitle">
        Upload, retrieve, and ask questions from your documents.
      </p>

      <Chat />
    </div>
  );
}

export default App;
