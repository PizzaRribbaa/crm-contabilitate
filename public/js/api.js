const API = {
    async get(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error((await res.json()).error || 'Eroare server');
        return res.json();
    },
    async post(url, data) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Eroare server');
        return json;
    },
    async put(url, data) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Eroare server');
        return json;
    },
    async delete(url) {
        const res = await fetch(url, { method: 'DELETE' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Eroare server');
        return json;
    },
    async upload(url, formData) {
        const res = await fetch(url, { method: 'POST', body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Eroare server');
        return json;
    }
};

function showAlert(container, message, type = 'info') {
    const div = document.createElement('div');
    div.className = `alert alert-${type}`;
    div.textContent = message;
    container.prepend(div);
    setTimeout(() => div.remove(), 4000);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ro-RO');
}

function badgeHtml(text, className) {
    return `<span class="badge badge-${className}">${text}</span>`;
}

function statusBadge(status) {
    const map = {
        pregatit: 'Pregatit',
        semnat: 'Semnat',
        activ: 'Activ',
        reziliat: 'Reziliat',
        inactiv: 'Inactiv',
        expirat: 'Expirat'
    };
    return badgeHtml(map[status] || status, status);
}
