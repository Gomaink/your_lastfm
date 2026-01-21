export function initSharePage() {
    const btnGenerate = document.getElementById('btn-generate');
    const shareResult = document.getElementById('share-result');
    const shareLoading = document.getElementById('share-loading');
    const sharePlaceholder = document.getElementById('share-placeholder');
    const btnDownload = document.getElementById('btn-download');

    if (!btnGenerate) return;

    btnGenerate.addEventListener('click', async () => {
        const period = document.getElementById('share-period').value;
        
        const types = [];
        if(document.getElementById('check-albums').checked) types.push('albums');
        if(document.getElementById('check-artists').checked) types.push('artists');
        if(document.getElementById('check-tracks').checked) types.push('tracks');

        if(types.length === 0) {
            alert("Please select at least one item to display (Albums, Artists or Tracks).");
            return;
        }

        sharePlaceholder.classList.add('d-none');
        shareResult.classList.add('d-none');
        btnDownload.classList.add('d-none');
        shareLoading.classList.remove('d-none');
        btnGenerate.disabled = true;

        try {
            const queryParams = new URLSearchParams({
                period: period,
                types: types.join(',')
            });

            const response = await fetch(`/api/generate-share?${queryParams}`);
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Generation failed');
            }

            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);

            shareResult.src = imageUrl;
            shareResult.classList.remove('d-none');
            
            btnDownload.href = imageUrl;
            btnDownload.download = `my-music-${period}.png`;
            btnDownload.classList.remove('d-none');

        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
            sharePlaceholder.classList.remove('d-none');
        } finally {
            shareLoading.classList.add('d-none');
            btnGenerate.disabled = false;
        }
    });
}