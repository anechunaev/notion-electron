const url = new URL(window.location.href);
const next = decodeURIComponent(url.searchParams.get('next') ?? '');

document.addEventListener('DOMContentLoaded', () => {
	const retry = document.getElementById('retry');
	const loading = document.getElementById('loading');

	if (retry) {
		retry.addEventListener('click', () => {
			retry.style.display = 'none';

			if (loading) {
				loading.style.display = 'block';
			}

			setTimeout(() => {
				window.location.replace(next);
			}, 100);
		});
	}
});

window.addEventListener('online', () => {
	window.location.replace(next);
});
