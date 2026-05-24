require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ExcelJS = require('exceljs');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// 업로드 설정 (Multer) - 디스크가 아닌 메모리(RAM)에만 버퍼로 저장
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. 대량 이미지 업로드 및 AI 병렬 분석 (In-Memory)
app.post('/api/analyze', upload.array('images', 50), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '이미지가 업로드되지 않았습니다.' });
        }
        
        if(!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE'){
            return res.status(500).json({ error: '.env 파일에 GEMINI_API_KEY를 설정해주세요.' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });
        
        const prompt = `
        제공된 신청서 이미지에서 정보를 분석하여 정확한 JSON 데이터로 추출해 주세요.
        수기로 작성된 텍스트와 체크박스 선택 여부를 신중하게 판독해야 합니다.
        체크박스는 [v] 표시 여부를 찾아 true/false로 반환하세요.
        출력은 반드시 다른 설명 없이 오직 순수한 JSON 형식이어야 합니다. Markdown 백틱(\`\`\`json)으로 감싸서 출력하세요.

        JSON 포맷 예시:
        {
          "company_name": "그린바이오",
          "business_number": "314-81-56789",
          "address": "세종특별자치시 도움로 128",
          "ceo_name": "김민수",
          "phone": "044-555-2381",
          "mobile": "010-4821-7734",
          "email": "admin@test.com",
          "location": "충북 청주시",
          "manager_name": "이서연",
          "pathology_check": true,
          "test_items": "토양 병해 진단",
          "change_reason": "해당 없음"
        }
        `;

        // Promise.all을 이용한 병렬 처리
        const analyzePromises = req.files.map(async (file, index) => {
            try {
                // 하드디스크 읽기(fs) 없이 메모리 버퍼(file.buffer)에서 즉시 Base64 변환
                const imageData = {
                    inlineData: {
                        data: file.buffer.toString("base64"),
                        mimeType: file.mimetype
                    }
                };

                const result = await model.generateContent([prompt, imageData]);
                const responseText = result.response.text();
                
                let jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsedData = JSON.parse(jsonStr);
                
                parsedData._id = index;
                parsedData._filename = file.originalname;

                return parsedData;
            } catch (err) {
                console.error(`File ${file.originalname} 분석 실패:`, err);
                return { _id: index, _filename: file.originalname, error: '분석 실패' };
            }
        });

        const results = await Promise.all(analyzePromises);

        // 결과 반환 후 가비지 컬렉터가 메모리의 버퍼 이미지를 자동 삭제 (보안 강화)
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('AI 분석 중 오류 발생:', error);
        res.status(500).json({ error: 'AI 이미지 분석 중 오류가 발생했습니다. 로그를 확인하세요.' });
    }
});

// 2. 대용량 엑셀 스트림 다운로드 (On-the-fly)
app.post('/api/export-excel', async (req, res) => {
    try {
        const dataArray = req.body; 
        if (!Array.isArray(dataArray)) {
            return res.status(400).json({ error: '데이터 형식이 올바르지 않습니다.' });
        }

        // 디스크의 템플릿 파일을 읽지 않고 메모리에서 엑셀 워크북 즉석 생성
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('신청서_목록');

        // 헤더(DB 컬럼 구조) 설정
        sheet.columns = [
            { header: '법인(상호)명', key: 'company_name', width: 25 },
            { header: '사업자등록번호', key: 'business_number', width: 20 },
            { header: '주소', key: 'address', width: 40 },
            { header: '대표자 성명', key: 'ceo_name', width: 15 },
            { header: '전화번호', key: 'phone', width: 20 },
            { header: '휴대전화번호', key: 'mobile', width: 20 },
            { header: '전자우편 주소', key: 'email', width: 25 },
            { header: '시험연구기관 소재지', key: 'location', width: 40 },
            { header: '운영책임자 성명', key: 'manager_name', width: 15 },
            { header: '병리성(체크여부)', key: 'pathology_check', width: 15 },
            { header: '시험항목', key: 'test_items', width: 30 },
            { header: '변경내용', key: 'change_reason', width: 20 }
        ];

        // 헤더 스타일 적용
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004C99' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.eachCell((cell) => {
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        });

        // 데이터 바인딩
        dataArray.forEach(data => {
            sheet.addRow([
                data.company_name || '',
                data.business_number || '',
                data.address || '',
                data.ceo_name || '',
                data.phone || '',
                data.mobile || '',
                data.email || '',
                data.location || '',
                data.manager_name || '',
                data.pathology_check ? '■ 병리성' : '',
                data.test_items || '',
                data.change_reason || ''
            ]);
        });

        // 생성된 데이터 행 테두리 스타일 적용
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.eachCell((cell) => {
                    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                });
            }
        });

        // HTTP 스트림을 통해 브라우저로 직접 엑셀 파일 쏘기 (디스크 저장 안함)
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="ASTIS_Batch_Result.xlsx"');

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('엑셀 생성 중 오류 발생:', error);
        res.status(500).json({ error: '엑셀 파일 생성 중 오류가 발생했습니다.' });
    }
});

module.exports = app;
