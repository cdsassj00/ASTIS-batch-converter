const app = require('./app');
const port = 3000;

app.listen(port, () => {
    console.log(`로컬 서버가 구동되었습니다 (메모리 버퍼 모드). http://localhost:${port}`);
});
