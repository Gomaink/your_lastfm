let listenersAttached = false;

export async function loadAccount() {
        await fetchAndRenderStats();

        if (!listenersAttached) {
        setupCsvButtons();
        listenersAttached = true;
    }
}

async function fetchAndRenderStats() {
    try {
        const response = await fetch('/api/user-stats');
        const data = await response.json();

        if (data.error) return;

        const usernameEl = document.getElementById('profile-username');
        if (usernameEl) usernameEl.innerText = data.username || "User";

        const avatarEl = document.querySelector('.profile-avatar img');
        if (avatarEl) {
            const defaultAvatar = "https://www.last.fm/static/images/defaults/player_default_artist.43043d554d46.png";
            avatarEl.src = data.avatar || defaultAvatar;
        }

        const fmt = (num) => new Intl.NumberFormat('pt-BR').format(num);

        updateText('profile-total-scrobbles', fmt(data.totalScrobbles));
        updateText('profile-artists', fmt(data.uniqueArtists));
        updateText('profile-albums', fmt(data.uniqueAlbums));
        updateText('profile-tracks', fmt(data.uniqueTracks));

        if (data.joinedDate) {
            const date = new Date(data.joinedDate * 1000); 
            const dateStr = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
            updateText('profile-joined-date', dateStr);
        }

    } catch (err) {
        console.error("Error loading account:", err);
    }
}

function updateText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function setupCsvButtons() {
    const btnExport = document.getElementById('btn-export-csv');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            window.location.href = '/api/export/scrobbles';
        });
    }

    const btnImport = document.getElementById('btn-import-trigger');
    const fileInput = document.getElementById('csv-upload-input');

    if (btnImport && fileInput) {
        btnImport.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files[0];
            if (!file) return;

            const originalText = btnImport.innerHTML;
            btnImport.innerText = "Uploading...";
            btnImport.disabled = true;

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/api/import/scrobbles', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await res.json();
                
                if (res.ok) {
                    alert(`Success! ${result.imported} imported scrobbles.`);
                    fetchAndRenderStats();
                } else {
                    alert('Error: ' + (result.error || 'Unknown error'));
                }
            } catch (err) {
                alert('Conection error.');
            } finally {
                btnImport.innerHTML = originalText;
                btnImport.disabled = false;
                fileInput.value = '';
            }
        });
    }
}