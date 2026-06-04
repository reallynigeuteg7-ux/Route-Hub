document.querySelectorAll(".upload-box input").forEach((input) => {
  input.addEventListener("change", function () {
    if (this.files && this.files[0]) {
      const box = this.closest(".upload-box");
      box.style.borderColor = "#00ff88"; // Зеленый при успехе
      box.querySelector("span").textContent = "Файл выбран ✅";
      box.querySelector(".plus").style.color = "#00ff88";
    }
  });
});
