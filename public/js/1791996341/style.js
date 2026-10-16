function collapseControl(e, l) {
if (e.className.indexOf('--open') > -1) {
e.className = 'collapse__' + l;
} else {
e.className = 'collapse__' + l + ' collapse__' + l + '--open';
}
}
document.addEventListener('DOMContentLoaded', function () {
var buttons = document.querySelectorAll('.collapse button');
for (var i = 0; i < buttons.length; i++) {
buttons[i].addEventListener('click', function () {
collapseControl(this.parentElement.querySelector('.collapse__arrow'), 'arrow');
collapseControl(this.parentElement.querySelector('.collapse__body'), 'body');
});
}
});
