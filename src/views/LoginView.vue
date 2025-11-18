<!-- src/views/LoginView.vue -->
<template>
  <div class="login-page">
    <div class="login-card">
      <h1>한길</h1>
      <p>아이디와 비밀번호를 입력해 주세요.</p>

      <form @submit.prevent="onSubmit">
        <input
          v-model="username"
          type="text"
          placeholder="아이디"
          class="input"
        />
        <input
          v-model="password"
          type="password"
          placeholder="비밀번호"
          class="input"
        />

        <button type="submit" class="login-button">
          로그인
        </button>
      </form>

      <p v-if="error" class="error">{{ error }}</p>
      <p class="hint">※ 개인용 사이트로 아이디/비밀번호는 브라우저에서만 사용됩니다.</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";

const router = useRouter();

const username = ref("");
const password = ref("");
const error = ref("");

// 백엔드 기본 URL (Render)
const API_BASE_URL = "https://flower-ocr-backend.onrender.com";

const onSubmit = async () => {
  error.value = "";

  // 단일 계정: .env에 없으면 기본값이 hangil / w010410 이라서
  // 프론트에서도 그걸로 로그인해야 함
  try {
    const res = await axios.post(`${API_BASE_URL}/login`, {
      username: username.value,
      password: password.value,
    });

    const token = res.data.access_token;

    if (!token) {
      throw new Error("토큰이 응답에 없습니다.");
    }

    // 토큰 저장
    localStorage.setItem("access_token", token);

    // 사용자 정보 (닉네임은 임의로 고정)
    localStorage.setItem(
      "user_info",
      JSON.stringify({ id: username.value, nickname: "한길" })
    );

    // 메인 페이지로 이동
    router.push({ name: "Main" });
  } catch (e) {
    console.error("로그인 실패:", e);
    error.value = "아이디 또는 비밀번호가 올바르지 않습니다.";
  }
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f5f5f5;
}

.login-card {
  background: #ffffff;
  padding: 32px 40px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  text-align: center;
  max-width: 360px;
  width: 100%;
}

.login-card h1 {
  margin-bottom: 8px;
}

.login-card p {
  margin: 4px 0 16px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
}

.input {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #ddd;
  font-size: 14px;
}

.login-button {
  margin-top: 4px;
  width: 100%;
  padding: 10px 16px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  background-color: #fdd835;
}

.login-button:hover {
  filter: brightness(0.97);
}

.error {
  color: #e53935;
  font-size: 13px;
  margin-top: 4px;
}

.hint {
  margin-top: 8px;
  font-size: 12px;
  color: #666;
}
</style>
