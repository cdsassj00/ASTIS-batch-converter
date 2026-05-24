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
    const tableBody = document.getElementById('tableBody');
    
    const resetBtn = document.getElementById('resetBtn');
    const downloadExcelBtn = document.getElementById('downloadExcelBtn');

    let currentFiles = [];

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
        
        // 누적 업로드 지원
        const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if(newFiles.length === 0) {
            alert('이미지 파일만 업로드 가능합니다.'); return;
        }

        currentFiles = [...currentFiles, ...newFiles];
        
        // 갤러리 렌더링
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
                renderTable(result.data);
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

    // 테이블 렌더링
    function renderTable(dataArray) {
        tableBody.innerHTML = ''; // 초기화
        dataArray.forEach((data, index) => {
            const tr = document.createElement('tr');
            
            // 데이터 매핑용 속성 저장
            tr.dataset.filename = data._filename || `image_${index}.jpg`;

            // 셀 생성 헬퍼
            const createCell = (key, value, isCheckbox = false) => {
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.name = key;
                if(isCheckbox) {
                    input.type = 'checkbox';
                    input.checked = value === true;
                } else {
                    input.type = 'text';
                    input.value = value || '';
                }
                td.appendChild(input);
                return td;
            };

            // 파일명 셀 (읽기 전용 라벨)
            const tdFile = document.createElement('td');
            tdFile.textContent = data._filename;
            tdFile.style.fontSize = '12px';
            tdFile.style.color = '#888';
            tr.appendChild(tdFile);

            tr.appendChild(createCell('company_name', data.company_name));
            tr.appendChild(createCell('business_number', data.business_number));
            tr.appendChild(createCell('address', data.address));
            tr.appendChild(createCell('ceo_name', data.ceo_name));
            tr.appendChild(createCell('phone', data.phone));
            tr.appendChild(createCell('mobile', data.mobile));
            tr.appendChild(createCell('email', data.email));
            tr.appendChild(createCell('location', data.location));
            tr.appendChild(createCell('manager_name', data.manager_name));
            tr.appendChild(createCell('pathology_check', data.pathology_check, true));
            tr.appendChild(createCell('test_items', data.test_items));
            tr.appendChild(createCell('change_reason', data.change_reason));

            tableBody.appendChild(tr);
        });
    }

    // 일괄 엑셀 다운로드
    downloadExcelBtn.addEventListener('click', async () => {
        // 테이블의 각 행을 수집하여 배열로 만듦
        const rows = document.querySelectorAll('#tableBody tr');
        const dataArray = [];

        rows.forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            const rowData = {};
            inputs.forEach(input => {
                if(input.type === 'checkbox') {
                    rowData[input.name] = input.checked;
                } else {
                    rowData[input.name] = input.value;
                }
            });
            dataArray.push(rowData);
        });

        downloadExcelBtn.disabled = true;
        downloadExcelBtn.textContent = "생성 중...";

        try {
            const response = await fetch('/api/export-excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataArray)
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = '신청서_대량변환결과.xlsx';
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
        fileInput.value = '';
        tableBody.innerHTML = '';
        
        resultSection.classList.add('hidden');
        previewArea.classList.add('hidden');
        
        uploadSection.classList.remove('hidden');
        dropZone.classList.remove('hidden');
    });
});
