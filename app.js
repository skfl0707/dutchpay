// 더치페이 정산기 - 1주차: 배포 확인용 뼈대
document.getElementById('status').textContent = '정상 접속되었습니다 ✔';

// PWA: 서비스 워커 등록 (홈 화면 추가, 오프라인 동작)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
