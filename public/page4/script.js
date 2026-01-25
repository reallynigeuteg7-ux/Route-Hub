document.addEventListener('DOMContentLoaded', () => {
    const cargoForm = document.getElementById('cargoForm');
    
    // Элементы модалки
    const successModal = document.getElementById('success-modal');
    const btnOk = document.getElementById('btn-ok');

    if (cargoForm) {
        cargoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('publishBtn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = "Публикация...";

            try {
                const cargoData = {
                    from_location: document.getElementById('from').value,
                    to_location: document.getElementById('to').value,
                    ready_date: document.getElementById('readyDate').value,
                    weight: document.getElementById('weight').value,
                    volume: document.getElementById('volume').value || 0,
                    type: document.getElementById('cargoType').value,
                    price: document.getElementById('price').value,
                    length: document.getElementById('length')?.value || 0,
                    width: document.getElementById('width')?.value || 0,
                    height: document.getElementById('height')?.value || 0,
                    loading_type: document.getElementById('loading_type').value,
                    description: document.getElementById('description')?.value || "",
                    lat: 0, 
                    lng: 0
                };

                const response = await fetch('/api/loads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cargoData)
                });

                if (response.ok) {
                    // ПОКАЗЫВАЕМ КРАСИВУЮ МОДАЛКУ ВМЕСТО ALERT
                    successModal.style.display = 'flex';
                } else {
                    alert("Ошибка сервера. Проверь данные.");
                }
            } catch (err) {
                alert("Ошибка сети. Сервер запущен?");
            } finally {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        });
    }

    // Логика закрытия модалки
    if (btnOk) {
        btnOk.addEventListener('click', () => {
            successModal.style.display = 'none';
            window.location.href = '../profile.html'; // Уходим в профиль
        });
    }
});