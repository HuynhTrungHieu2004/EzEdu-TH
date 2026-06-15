import { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [backendStatus, setBackendStatus] = useState("Đang kiểm tra...");

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_BASE_URL}/health`)
      .then((res) => {
        setBackendStatus(`Backend hoạt động: ${res.data.status}`);
      })
      .catch((error) => {
        console.error(error);
        setBackendStatus("Không kết nối được backend");
      });
  }, []);

  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>AI Question Generator</h1>

      <p>
        Hệ thống sinh câu hỏi đánh giá năng lực tự động từ học liệu điện tử
        bằng mô hình ngôn ngữ lớn.
      </p>

      <div
        style={{
          marginTop: "24px",
          padding: "16px",
          border: "1px solid #ddd",
          borderRadius: "8px",
          maxWidth: "500px",
        }}
      >
        <strong>Trạng thái backend:</strong>
        <p>{backendStatus}</p>
      </div>
    </main>
  );
}

export default App;
