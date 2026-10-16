document.addEventListener('DOMContentLoaded', function () {
var form = document.querySelector('form');
if (!form) return;
form.addEventListener('submit', function (e) {
e.preventDefault();
var formData = new FormData(this);
var body = {};
formData.forEach(function (value, key) {
body[key] = value;
});
var xhr = new XMLHttpRequest();
xhr.onreadystatechange = function () {
if (xhr.readyState === 4) {
var existing = document.querySelector('.response');
if (existing) existing.remove();
var resP = document.createElement('p');
resP.className = 'response';
try {
var res = JSON.parse(xhr.responseText);
if (xhr.status === 200 && !res.error) {
resP.textContent = res.message || 'Thank you! Your message has been sent.';
form.reset();
} else {
resP.textContent = res.error || 'Failed to send message. Please try again.';
}
} catch (err) {
resP.textContent = 'Thank you! Your message has been sent.';
form.reset();
}
var textContainer = document.querySelector('.text');
if (textContainer) {
textContainer.insertBefore(resP, form);
}
}
};
xhr.open('POST', '/contact/?_=' + Date.now());
xhr.setRequestHeader('Content-Type', 'application/json');
xhr.send(JSON.stringify(body));
});
});
