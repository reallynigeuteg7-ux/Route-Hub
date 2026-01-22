document.addEventListener('DOMContentLoaded', () => {
    const cargoForm = document.getElementById('cargoForm');
    
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
                    ready_date: document.getElementById('readyDate').value, // Соединяем с сервером
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
                    alert("Груз опубликован!");
                    window.location.href = "."; // Укажи путь к своей главной
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
});