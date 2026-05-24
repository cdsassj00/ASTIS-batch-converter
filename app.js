const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ExcelJS = require('exceljs');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let genAI = null;

// 1. 다중 양식 자동 분류 및 동적 스키마 추출
app.post('/api/analyze', upload.array('images', 50), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '이미지가 업로드되지 않았습니다.' });
        }
        
        if(!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: '환경 변수에 GEMINI_API_KEY가 설정되지 않았습니다.' });
        }
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });
        
        const prompt = `
        제공된 이미지 문서를 분석하여 양식의 종류를 식별하고, 해당 양식에 포함된 모든 항목(필드)들의 이름과 값을 동적으로 추출해 주세요.
        수기로 작성된 텍스트와 체크박스는 신중하게 판독하세요.
        체크박스는 [v] 표시 여부를 찾아 true/false로 반환하세요.
        
        출력은 반드시 다른 설명 없이 오직 순수한 JSON 형식이어야 하며, Markdown 백틱(\`\`\`json)으로 감싸서 출력하세요.
        문서 상단이나 제목을 보고 양식 종류를 파악하여 'form_type'에 넣으세요.
        해당 문서에 존재하는 모든 기입란은 'fields' 객체 안에 Key-Value 쌍으로 넣으세요.
        (Key 이름은 문서에 적힌 항목명 그대로 사용하세요. 예: "주소", "휴대폰번호", "신청인")

        JSON 포맷 예시:
        {
          "form_type": "토양 검정 신청서",
          "fields": {
            "신청인 성명": "홍길동",
            "연락처": "010-1234-5678",
            "농장 주소": "강원도 평창군",
            "병리성검사여부": true
          }
        }
        `;

        const analyzePromises = req.files.map(async (file, index) => {
            try {
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
                return { _id: index, _filename: file.originalname, form_type: "분석 실패", fields: { "오류": "인식 실패" } };
            }
        });

        const results = await Promise.all(analyzePromises);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('AI 분석 중 오류 발생:', error);
        res.status(500).json({ error: 'AI 이미지 분석 중 오류가 발생했습니다.' });
    }
});

// 2. 다중 엑셀 시트 분할 생성 (Dynamic Multi-sheet Export)
app.post('/api/export-excel', async (req, res) => {
    try {
        const dataArray = req.body; 
        if (!Array.isArray(dataArray)) {
            return res.status(400).json({ error: '데이터 형식이 올바르지 않습니다.' });
        }

        const workbook = new ExcelJS.Workbook();

        // form_type 별로 그룹핑
        const groupedData = dataArray.reduce((acc, curr) => {
            const type = curr.form_type || '알수없는_양식';
            if (!acc[type]) acc[type] = [];
            acc[type].push(curr);
            return acc;
        }, {});

        // 각 그룹(양식)별로 시트 생성
        for (const [formType, records] of Object.entries(groupedData)) {
            // 시트 이름 제한 (31자 이내, 특수문자 제거)
            const safeSheetName = formType.replace(/[\[\]\*\/\\\?\:]/g, '').substring(0, 31);
            const sheet = workbook.addWorksheet(safeSheetName);

            // 해당 시트의 모든 레코드(문서들)에서 사용된 Key(컬럼명)를 모두 수집하여 Set으로 중복 제거
            const allKeys = new Set();
            records.forEach(r => {
                if(r.fields) {
                    Object.keys(r.fields).forEach(k => allKeys.add(k));
                }
            });
            const columnsArray = Array.from(allKeys);

            // 엑셀 헤더 세팅 (첫 열은 파일명)
            const excelColumns = [{ header: '파일명', key: '_filename', width: 25 }];
            columnsArray.forEach(key => {
                excelColumns.push({ header: key, key: key, width: 20 });
            });
            sheet.columns = excelColumns;

            // 헤더 디자인
            const headerRow = sheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004C99' } };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            headerRow.eachCell((cell) => {
                cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            });

            // 데이터 행 추가
            records.forEach(r => {
                const rowData = { _filename: r._filename || '' };
                if (r.fields) {
                    columnsArray.forEach(key => {
                        let val = r.fields[key];
                        // 체크박스 불리언 값 처리
                        if (val === true) val = '■ 체크됨';
                        else if (val === false) val = '';
                        rowData[key] = val || '';
                    });
                }
                sheet.addRow(rowData);
            });

            // 셀 테두리
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    row.eachCell((cell) => {
                        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    });
                }
            });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="ASTIS_MultiSheet_Result.xlsx"');

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('엑셀 생성 중 오류 발생:', error);
        res.status(500).json({ error: '엑셀 파일 생성 중 오류가 발생했습니다.' });
    }
});

module.exports = app;
