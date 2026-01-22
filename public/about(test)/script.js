  const burger = document.querySelector(".burger");
  const mobileMenu = document.querySelector(".mobile-menu");

  burger.addEventListener("click", () => {
    burger.classList.toggle("open");
    
    if (mobileMenu.style.display === "flex") {
      mobileMenu.style.display = "none";
    } else {
      mobileMenu.style.display = "flex";
    }
  });