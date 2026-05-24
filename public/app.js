document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const imageGallery = document.getElementById('imageGallery');
    const previewArea = document.getElementById('previewArea');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    const uploadSection = document.getElementById('uploadSection');
    const resultSection = document.getElementById('resultSection');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const dynamicTablesContainer = document.getElementById('dynamicTablesContainer');
    
    const resetBtn = document.getElementById('resetBtn');
    const downloadExcelBtn = document.getElementById('downloadExcelBtn');

    let currentFiles = [];
    let serverRawData = []; // 서버에서 받은 원본 데이터 저장용

    // Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
            e.preventDefault(); e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // 화면 어디서든 Ctrl+V (붙여넣기) 지원
    document.addEventListener('paste', (e) => {
        if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
            handleFiles(e.clipboardData.files);
        }
    });

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        
        const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if(newFiles.length === 0) {
            alert('이미지 파일만 업로드 가능합니다.'); return;
        }

        currentFiles = [...currentFiles, ...newFiles];
        
        imageGallery.innerHTML = '';
        currentFiles.forEach(file => {
            const img = document.createElement('img');
            img.className = 'gallery-item';
            img.file = file;
            imageGallery.appendChild(img);
            
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(file);
        });

        dropZone.classList.add('hidden');
        previewArea.classList.remove('hidden');
    }

    clearBtn.addEventListener('click', () => {
        currentFiles = [];
        fileInput.value = '';
        previewArea.classList.add('hidden');
        dropZone.classList.remove('hidden');
    });

    // AI 분석 (다중)
    analyzeBtn.addEventListener('click', async () => {
        if (currentFiles.length === 0) return;

        const formData = new FormData();
        currentFiles.forEach(file => {
            formData.append('images', file);
        });

        loadingOverlay.classList.remove('hidden');

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                serverRawData = result.data;
                renderDynamicTables(serverRawData);
                uploadSection.classList.add('hidden');
                resultSection.classList.remove('hidden');
            } else {
                alert('분석 실패: ' + (result.error || '알 수 없는 오류'));
            }
        } catch (error) {
            console.error('Error:', error);
            alert('서버 통신 중 오류가 발생했습니다.');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    });

    // V5: 다중 양식 테이블 동적 렌더링
    function renderDynamicTables(dataArray) {
        dynamicTablesContainer.innerHTML = ''; // 초기화

        // form_type 기준으로 그룹화
        const groupedData = dataArray.reduce((acc, curr) => {
            const type = curr.form_type || '분류되지_않은_양식';
            if (!acc[type]) acc[type] = [];
            acc[type].push(curr);
            return acc;
        }, {});

        // 그룹(양식)마다 새로운 표를 그린다
        for (const [formType, records] of Object.entries(groupedData)) {
            // 그룹에 속한 모든 필드(Key) 추출
            const allKeys = new Set();
            records.forEach(r => {
                if(r.fields) {
                    Object.keys(r.fields).forEach(k => allKeys.add(k));
                }
            });
            const columnsArray = Array.from(allKeys);

            // 컨테이너
            const wrapper = document.createElement('div');
            wrapper.className = 'table-wrapper';
            wrapper.style.marginBottom = '40px';

            // 양식 타이틀
            const title = document.createElement('h3');
            title.textContent = `📋 양식 그룹: ${formType} (${records.length}건)`;
            title.style.color = 'var(--primary-color)';
            title.style.marginBottom = '10px';
            wrapper.appendChild(title);

            // 테이블 생성
            const table = document.createElement('table');
            table.dataset.formType = formType; // 나중에 저장할 때 구분을 위해 저장

            // thead 생성
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            
            const thFile = document.createElement('th');
            thFile.textContent = '파일명';
            headerRow.appendChild(thFile);

            columnsArray.forEach(colName => {
                const th = document.createElement('th');
                th.textContent = colName;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // tbody 생성
            const tbody = document.createElement('tbody');
            records.forEach((record, index) => {
                const tr = document.createElement('tr');
                tr.dataset.filename = record._filename;

                // 파일명 셀
                const tdFile = document.createElement('td');
                tdFile.textContent = record._filename;
                tdFile.style.fontSize = '12px';
                tdFile.style.color = '#888';
                tr.appendChild(tdFile);

                // 데이터 셀들
                columnsArray.forEach(colName => {
                    const td = document.createElement('td');
                    const input = document.createElement('input');
                    input.name = colName;
                    
                    let val = record.fields ? record.fields[colName] : '';
                    if (typeof val === 'boolean') {
                        input.type = 'checkbox';
                        input.checked = val;
                    } else {
                        input.type = 'text';
                        input.value = val || '';
                    }
                    td.appendChild(input);
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            wrapper.appendChild(table);
            dynamicTablesContainer.appendChild(wrapper);
        }
    }

    // 일괄 엑셀 다운로드 (동적 멀티 시트 대응)
    downloadExcelBtn.addEventListener('click', async () => {
        const finalDataArray = [];
        
        // 화면에 있는 모든 테이블(양식 그룹) 순회
        const tables = document.querySelectorAll('#dynamicTablesContainer table');
        
        tables.forEach(table => {
            const formType = table.dataset.formType;
            const rows = table.querySelectorAll('tbody tr');
            
            rows.forEach(tr => {
                const filename = tr.dataset.filename;
                const fields = {};
                
                const inputs = tr.querySelectorAll('input');
                inputs.forEach(input => {
                    if(input.type === 'checkbox') {
                        fields[input.name] = input.checked;
                    } else {
                        fields[input.name] = input.value;
                    }
                });

                finalDataArray.push({
                    _filename: filename,
                    form_type: formType,
                    fields: fields
                });
            });
        });

        downloadExcelBtn.disabled = true;
        downloadExcelBtn.textContent = "생성 중...";

        try {
            const response = await fetch('/api/export-excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalDataArray)
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'ASTIS_분류된_신청서_목록.xlsx';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                const resData = await response.json();
                alert('엑셀 생성 실패: ' + resData.error);
            }
        } catch (error) {
            console.error('Export Error:', error);
            alert('엑셀 다운로드 중 오류가 발생했습니다.');
        } finally {
            downloadExcelBtn.disabled = false;
            downloadExcelBtn.textContent = "엑셀 다운로드 📥";
        }
    });

    // 리셋
    resetBtn.addEventListener('click', () => {
        currentFiles = [];
        serverRawData = [];
        fileInput.value = '';
        dynamicTablesContainer.innerHTML = '';
        
        resultSection.classList.add('hidden');
        previewArea.classList.add('hidden');
        
        uploadSection.classList.remove('hidden');
        dropZone.classList.remove('hidden');
    });
});
