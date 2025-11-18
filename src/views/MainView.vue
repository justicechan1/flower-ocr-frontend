<template>
  <div class="main-page">
    <header class="main-header">
      <div class="logo">화환 OCR</div>
      <div class="user-info" v-if="user">
        <span>{{ user.nickname }} 님</span>
        <button @click="logout">로그아웃</button>
      </div>
    </header>

    <main class="main-content">
      <section class="upload-card">
        <h2>이미지 일괄 처리</h2>
        <p>
          왼쪽에는 대기중인 이미지, 오른쪽에는 처리된 이미지가 표시됩니다.<br />
          💡 이미지를 복사(Ctrl+C)한 뒤 붙여넣기(Ctrl+V) 하면 자동 추가<br />
          💡 대기 이미지를 클릭하면 하단에서 이름/이미지 수정 가능
        </p>

        <!-- 파일 선택 영역 -->
        <div class="file-controls">
          <label class="file-button">
            폴더/파일 선택
            <input
              type="file"
              accept="image/*"
              multiple
              @change="onFilesSelected"
              webkitdirectory
              directory
            />
          </label>

          <div class="counts">
            <span>대기: {{ pendingImages.length }}개</span>
            <span>완료: {{ processedImages.length }}개</span>
          </div>

          <div class="actions">
            <button
              @click="processAllPending"
              :disabled="pendingImages.length === 0 || isProcessing"
            >
              {{ isProcessing ? "처리 중..." : "모든 이미지 OCR 처리" }}
            </button>
            <button
              @click="downloadZip"
              :disabled="processedImages.length === 0 || isProcessing"
            >
              ZIP 다운로드
            </button>
          </div>
        </div>

        <!-- 좌우 패널 -->
        <div class="panels">
          <!-- 왼쪽: 대기 목록 -->
          <div class="panel left">
            <h3>대기 중 / 실패한 이미지</h3>

            <p v-if="pendingImages.length === 0" class="empty-text">
              대기 중인 이미지가 없습니다.
            </p>

            <ul v-else class="image-list">
              <li
                v-for="item in pendingImages"
                :key="item.id"
                class="image-item"
                :class="[ item.status, selectedItem?.id === item.id ? 'selected' : '' ]"
                @click="selectPending(item)"
              >
                <button
                  class="delete-btn"
                  @click.stop="removePending(item.id)"
                  :disabled="isProcessing"
                >
                  ×
                </button>

                <img :src="item.previewUrl" alt="preview" />

                <div class="info">
                  <div class="name">{{ item.file.name }}</div>
                  <div class="status">
                    상태:
                    <span v-if="item.status === 'pending'">대기</span>
                    <span v-else-if="item.status === 'processing'">처리 중</span>
                    <span v-else-if="item.status === 'failed'">실패</span>
                  </div>
                  <div v-if="item.errorMessage" class="error-msg">
                    {{ item.errorMessage }}
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <!-- 오른쪽: 완료 목록 -->
          <div class="panel right">
            <h3>처리 완료된 이미지</h3>

            <p v-if="processedImages.length === 0" class="empty-text">
              처리 완료된 이미지가 없습니다.
            </p>

            <ul v-else class="image-list">
              <li v-for="item in processedImages" :key="item.id" class="image-item processed">
                <img :src="item.previewUrl" alt="preview" />
                <div class="info">
                  <div class="name">원본: {{ item.file.name }}</div>
                  <div class="name">새 이름: <b>{{ item.newName }}</b></div>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <p v-if="hasFailed" class="warning-text">
          실패한 이미지는 목록에 남습니다. 필요시 X 버튼으로 삭제하세요.
        </p>

        <!-- 하단 편집 패널 -->
        <section v-if="selectedItem" class="edit-panel">
          <h3>선택한 이미지 편집</h3>

          <div class="edit-content">
            <div class="edit-preview-wrap">
              <img :src="selectedItem.previewUrl" class="edit-preview" />
            </div>

            <div class="edit-controls">
              <div class="field">
                <label>새 이미지 이름 (확장자 제외)</label>
                <input type="text" v-model="editName" />
              </div>

              <div class="field">
                <label>이미지 교체</label>
                <input type="file" accept="image/*" @change="onReplaceImage" />
              </div>

              <div class="edit-buttons">
                <button @click="saveEditedToProcessed">저장</button>
                <button class="secondary" @click="cancelEdit">취소</button>
              </div>

              <p class="hint">OCR을 거치지 않고 수동으로 이름 변경.</p>
            </div>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const router = useRouter();
const API_BASE_URL = "https://flower-ocr-backend.onrender.com";

const user = ref(null);
const pendingImages = ref([]);
const processedImages = ref([]);
const isProcessing = ref(false);

// 편집 관련
const selectedItem = ref(null);
const editName = ref("");

// 로그인 체크 + paste 이벤트 등록
onMounted(() => {
  const token = localStorage.getItem("access_token");
  if (!token) {
    router.push({ name: "Login" });
    return;
  }

  const raw = localStorage.getItem("user_info");
  if (raw) {
    try {
      user.value = JSON.parse(raw);
    } catch {}
  }

  window.addEventListener("paste", onPaste);
});

onUnmounted(() => {
  window.removeEventListener("paste", onPaste);
});

// 로그아웃
const logout = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user_info");
  router.push({ name: "Login" });
};

const hasFailed = computed(() =>
  pendingImages.value.some((item) => item.status === "failed")
);

// 이미지 대기 목록에 추가
const addFileToPending = (file) => {
  if (!file?.type.startsWith("image/")) return;

  const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
  pendingImages.value.push({
    id,
    file,
    previewUrl: URL.createObjectURL(file),
    status: "pending",
    errorMessage: "",
  });
};

// 파일 선택
const onFilesSelected = (e) => {
  Array.from(e.target.files).forEach(addFileToPending);
  e.target.value = "";
};

// 이미지 붙여넣기
const onPaste = (e) => {
  const items = e.clipboardData.items;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      addFileToPending(file);
      e.preventDefault();
    }
  }
};

// Pending 하나 클릭 → 편집 모드
const selectPending = (item) => {
  selectedItem.value = item;
  const dot = item.file.name.lastIndexOf(".");
  editName.value = dot !== -1 ? item.file.name.slice(0, dot) : item.file.name;
};

// 개별 삭제
const removePending = (id) => {
  pendingImages.value = pendingImages.value.filter((i) => i.id !== id);

  if (selectedItem.value?.id === id) {
    selectedItem.value = null;
    editName.value = "";
  }
};

// 편집 → 이미지 교체
const onReplaceImage = (e) => {
  const file = e.target.files[0];
  if (!file || !selectedItem.value) return;

  selectedItem.value.file = file;
  selectedItem.value.previewUrl = URL.createObjectURL(file);

  const dot = file.name.lastIndexOf(".");
  editName.value = dot !== -1 ? file.name.slice(0, dot) : file.name;

  e.target.value = "";
};

// 편집 저장 → 완료 목록으로 이동
const saveEditedToProcessed = () => {
  if (!selectedItem.value) return;

  const base = editName.value.trim();
  if (!base) return alert("이미지 이름을 입력하세요.");

  const item = selectedItem.value;
  const dot = item.file.name.lastIndexOf(".");
  const ext = dot !== -1 ? item.file.name.slice(dot) : ".jpg";
  const newName = base + ext;

  processedImages.value.push({
    id: item.id,
    file: item.file,
    previewUrl: item.previewUrl,
    newName,
  });

  pendingImages.value = pendingImages.value.filter((i) => i.id !== item.id);

  selectedItem.value = null;
  editName.value = "";
};

// 편집 취소
const cancelEdit = () => {
  selectedItem.value = null;
  editName.value = "";
};

// 개별 OCR 처리
const processSingleImage = async (item) => {
  item.status = "processing";
  item.errorMessage = "";

  const formData = new FormData();
  formData.append("file", item.file);

  const token = localStorage.getItem("access_token");

  const headers = { "Content-Type": "multipart/form-data" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await axios.post(`${API_BASE_URL}/ocr`, formData, { headers });

    const safeText = (res.data.safe_text || res.data.text || "").trim();
    const baseName = safeText || "noname";

    const dot = item.file.name.lastIndexOf(".");
    const ext = dot !== -1 ? item.file.name.slice(dot) : ".jpg";
    const newName = `${baseName}${ext}`;

    processedImages.value.push({
      id: item.id,
      file: item.file,
      previewUrl: item.previewUrl,
      newName,
    });

    pendingImages.value = pendingImages.value.filter((i) => i.id !== item.id);

    if (selectedItem.value?.id === item.id) {
      selectedItem.value = null;
      editName.value = "";
    }
  } catch (err) {
    console.error("OCR 오류:", err);

    // JWT 만료 → 자동 로그아웃
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      alert("로그인이 만료되었습니다. 다시 로그인해주세요.");
      logout();
      return;
    }

    item.status = "failed";
    item.errorMessage = "OCR 처리 실패";
  }
};

// 모든 pending 이미지 OCR 처리
const processAllPending = async () => {
  if (!pendingImages.value.length) return;

  isProcessing.value = true;
  for (const item of [...pendingImages.value]) {
    if (item.status === "failed") {
      item.status = "pending";
      item.errorMessage = "";
    }
    await processSingleImage(item);
  }
  isProcessing.value = false;
};

// ZIP 다운로드
const downloadZip = async () => {
  if (!processedImages.value.length) return;

  const zip = new JSZip();
  const folder = zip.folder("renamed");

  for (const item of processedImages.value) {
    const buf = await item.file.arrayBuffer();
    folder.file(item.newName, buf);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "renamed-images.zip");
};
</script>

<style scoped>
.main-page {
  min-height: 100vh;
  background: #f5f7fb;
  color: #333;
  display: flex;
  flex-direction: column;
}

.main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.logo {
  font-weight: 700;
}

.user-info {
  display: flex;
  gap: 12px;
  align-items: center;
}

.user-info button {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #ccc;
  background: #fafafa;
  cursor: pointer;
}

.main-content {
  padding: 24px;
  display: flex;
  justify-content: center;
}

.upload-card {
  max-width: 1080px;
  width: 100%;
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
}

.upload-card h2 {
  margin-top: 0;
  margin-bottom: 8px;
}

.upload-card > p {
  margin-top: 0;
  margin-bottom: 20px;
  color: #555;
  font-size: 0.95rem;
  line-height: 1.5;
}

/* 파일 컨트롤 영역 */
.file-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.file-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border-radius: 8px;
  background: #4a6cf7;
  color: #fff;
  cursor: pointer;
  font-size: 0.95rem;
}

.file-button input {
  display: none;
}

.counts {
  display: flex;
  gap: 12px;
  font-size: 0.9rem;
  color: #555;
}

.actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.actions button {
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  background: #e5e7eb;
}

.actions button:disabled {
  opacity: 0.5;
  cursor: default;
}

.actions button:first-of-type {
  background: #4a6cf7;
  color: #fff;
}

/* 좌우 패널 */
.panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-top: 16px;
}

.panel {
  padding: 16px;
  border-radius: 10px;
  background: #f9fafb;
}

.panel h3 {
  margin-top: 0;
  margin-bottom: 8px;
}

.empty-text {
  margin-top: 12px;
  color: #777;
}

/* 이미지 리스트 */
.image-list {
  list-style: none;
  padding: 0;
  margin: 0;
  margin-top: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.image-item {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  background: #ffffff;
  margin-bottom: 6px;
  align-items: center;
  border: 1px solid transparent;
  cursor: pointer;
}

.image-item.selected {
  border-color: #fb923c;
  box-shadow: 0 0 0 1px #fed7aa;
}

.image-item .delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
}

.image-item .delete-btn:hover:not(:disabled) {
  background: #e53935;
}

.image-item .delete-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.image-item img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
}

.image-item.pending {
  border-color: #e0e0e0;
}

.image-item.processing {
  border-color: #4a6cf7;
  background: #eef2ff;
}

.image-item.failed {
  border-color: #e11d48;
  background: #fef2f2;
}

.image-item.processed {
  border-color: #22c55e;
  background: #f0fdf4;
}

.info {
  flex: 1;
}

.name {
  font-size: 0.9rem;
  margin-bottom: 4px;
  word-break: break-all;
}

.status {
  font-size: 0.8rem;
  color: #555;
}

.error-msg {
  margin-top: 2px;
  font-size: 0.8rem;
  color: #e11d48;
}

/* 경고 문구 */
.warning-text {
  margin-top: 16px;
  font-size: 0.9rem;
  color: #c62828;
}

/* 하단 편집 패널 */
.edit-panel {
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid #e5e7eb;
}

.edit-panel h3 {
  margin-top: 0;
  margin-bottom: 12px;
}

.edit-content {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.edit-preview-wrap {
  flex: 0 0 260px;
  max-width: 100%;
}

.edit-preview {
  width: 100%;
  max-height: 260px;
  object-fit: contain;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #111827;
}

.edit-controls {
  flex: 1;
  min-width: 220px;
}

.field {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 0.9rem;
  font-weight: 500;
}

.field input[type="text"] {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  font-size: 0.9rem;
}

.field input[type="file"] {
  font-size: 0.85rem;
}

.field small {
  font-size: 0.78rem;
  color: #6b7280;
}

.edit-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.edit-buttons button {
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
}

.edit-buttons button:first-of-type {
  background: #16a34a;
  color: #fff;
}

.edit-buttons button.secondary {
  background: #e5e7eb;
}

.hint {
  margin-top: 10px;
  font-size: 0.8rem;
  color: #6b7280;
}

/* 반응형 */
@media (max-width: 768px) {
  .panels {
    grid-template-columns: 1fr;
  }

  .actions {
    margin-left: 0;
  }

  .edit-content {
    flex-direction: column;
  }

  .edit-preview-wrap {
    max-width: 100%;
  }
}
</style>
