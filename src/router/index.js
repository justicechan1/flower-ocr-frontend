// src/router/index.js
import { createRouter, createWebHistory } from "vue-router";
import LoginView from "../views/LoginView.vue";
import MainView from "../views/MainView.vue";

const routes = [
  {
    path: "/login",
    name: "Login",
    component: LoginView,
  },
  {
    path: "/",
    name: "Main",
    component: MainView,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 로그인 여부 확인: access_token 이 있으면 로그인된 상태
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem("access_token");
  const isLoggedIn = !!token;

  if (to.name !== "Login" && !isLoggedIn) {
    return next({ name: "Login" });
  }
  if (to.name === "Login" && isLoggedIn) {
    return next({ name: "Main" });
  }
  next();
});

export default router;
