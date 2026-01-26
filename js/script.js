/* =========================================
   1. CONFIGURATION & INITIALIZATION
   ========================================= */
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=0&single=true&output=csv";
const bioSheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=263826725&single=true&output=csv";

let allProjectData = [];
const cursorElement = document.getElementById('custom-cursor');

// START LOADING PULSE (Immediate)
if (cursorElement) cursorElement.classList.add('cursor-loading');

// FETCH DATABASE
Papa.parse(sheetURL, {
    download: true,
    header: true,
    complete: function(results) {
        allProjectData = results.data;
        
        // Initial Renders
        renderTable(allProjectData); 
        renderTags(allProjectData);  
        renderScene(allProjectData); 
        
        // Handle Hash Navigation
        const hash = window.location.hash;
        if (hash === '#archive') openArchive();
        else if (hash.length > 1) openProject(hash.substring(1));

        // Start Physics Engine
        requestAnimationFrame(animateDots);
        
        // STOP LOADING PULSE
        if (cursorElement) cursorElement.classList.remove('cursor-loading');
    },
    error: function(err) {
        console.error("Error loading database:", err);
        if (cursorElement) cursorElement.classList.remove('cursor-loading');
    }
});

/* =========================================
   2. SCENE LOGIC (The Dots)
   ========================================= */
let activeDots = [];
let mouse = { x: -9999, y: -9999 }; 

function renderScene(data) {
    const container = document.getElementById('dots-container');
    if (!container) return;

    container.innerHTML = ""; 
    activeDots = []; 

    // --- A. RENDER PROJECT DOTS ---
    data.forEach(project => {
        if (!project.project_name) return;

        const dot = document.createElement('div');
        dot.className = 'dot';
        
        // Random Position & Velocity
        let x = Math.random() * 80 + 10; 
        let y = Math.random() * 80 + 10;
        let vx = (Math.random() - 0.5) * 0.06;
        let vy = (Math.random() - 0.5) * 0.06;

        dot.style.left = x + '%';
        dot.style.top = y + '%';
        dot.style.transform = `translate(-50%, -50%) scale(1)`;
        dot.style.opacity = project.folder ? 1 : 0.3; 
        
        container.appendChild(dot);

        activeDots.push({
            element: dot,
            x: x, y: y, vx: vx, vy: vy,
            folder: project.folder,
            hasFolder: !!project.folder,
            isArchive: false 
        });
    });

    // --- B. RENDER THE "ARCHIVE TRIGGER" DOT ---
    const archiveDot = document.createElement('div');
    archiveDot.id = 'archive-trigger';
    archiveDot.onclick = openArchive;
    
    // Start at center
    let ax = 50; 
    let ay = 50;
    
    // Drift velocity
    let avx = (Math.random() - 0.5) * 0.06;
    let avy = (Math.random() - 0.5) * 0.06;

    archiveDot.style.left = ax + '%';
    archiveDot.style.top = ay + '%';
    container.appendChild(archiveDot);

    activeDots.push({
        element: archiveDot,
        x: ax, y: ay, vx: avx, vy: avy,
        folder: null, hasFolder: false,
        isArchive: true 
    });
}

/* =========================================
   3. PHYSICS ENGINE
   ========================================= */
const SENSITIVITY_RADIUS = 100; 
const MAX_SCALE = 1.1;            

function animateDots() {
    const archiveOpen = document.getElementById('archive-overlay').style.display === 'flex';
    const projectOpen = document.getElementById('project-overlay').style.display === 'flex';
    const aboutOpen = document.getElementById('about-overlay').style.display === 'flex';
    const isOverlayOpen = archiveOpen || projectOpen || aboutOpen;
    
    let isHoveringAny = false;
    const localMouseX = isOverlayOpen ? -9999 : mouse.x;
    const localMouseY = isOverlayOpen ? -9999 : mouse.y;

    activeDots.forEach(dot => {
        // 1. Position Math
        const dotPixelX = (window.innerWidth * dot.x) / 100;
        const dotPixelY = (window.innerHeight * dot.y) / 100;
        const dist = Math.hypot(localMouseX - dotPixelX, localMouseY - dotPixelY);

        // 2. Move Logic
        let speedFactor = 1.0;
        if (dist < SENSITIVITY_RADIUS) {
            speedFactor = 1 - (1 - (dist / SENSITIVITY_RADIUS)); 
        }

        dot.x += dot.vx * speedFactor;
        dot.y += dot.vy * speedFactor;

        // Bounce off walls
        if (dot.x <= 2 || dot.x >= 98) dot.vx *= -1;
        if (dot.y <= 2 || dot.y >= 98) dot.vy *= -1;

        // Update DOM
        dot.element.style.left = dot.x + '%';
        dot.element.style.top = dot.y + '%';

        // 3. Visual Logic
        if (dot.isArchive) {
            if (dist < SENSITIVITY_RADIUS) isHoveringAny = true;
        } 
        else {
            let scale = 1;
            let shadowStyle = 'none';

            if (dist < SENSITIVITY_RADIUS) {
                const proximity = 1 - (dist / SENSITIVITY_RADIUS);
                scale = 1 + (proximity * (MAX_SCALE - 1));

                if (dot.hasFolder) {
                    isHoveringAny = true;
                    const blur = 15 * proximity;   
                    const spread = 2 * proximity; 
                    const alpha = proximity * 1; 
                    shadowStyle = `0 0 ${blur}px ${spread}px rgba(0, 47, 167, ${alpha})`;
                    dot.element.style.opacity = 1;
                } else {
                    dot.element.style.opacity = 0.3;
                }
            } else {
                dot.element.style.opacity = dot.hasFolder ? 1 : 0.3;
            }

            dot.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
            dot.element.style.boxShadow = shadowStyle;
        }
    });

    if (!isOverlayOpen) {
        document.body.style.cursor = isHoveringAny ? 'pointer' : 'default';
    }
    
    requestAnimationFrame(animateDots);
}

document.addEventListener('mousemove', (e) => { 
    mouse.x = e.clientX; 
    mouse.y = e.clientY; 
});

// Click Handler for Dots
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('dot')) {
        const dotData = activeDots.find(d => d.element === e.target);
        if (dotData && dotData.hasFolder) openProject(dotData.folder);
    }
});

/* =========================================
   4. UI HELPER FUNCTIONS
   ========================================= */

function renderTags(data) {
    const tagBar = document.getElementById('tag-bar');
    if (!tagBar) return;
    
    tagBar.innerHTML = ""; 
    let allTags = new Set();
    
    data.forEach(project => {
        if (project.medium) {
            const tags = project.medium.split(',').map(t => t.trim());
            tags.forEach(tag => { if(tag) allTags.add(tag); });
        }
    });
    
    const allBtn = document.createElement('button');
    allBtn.textContent = "all";
    allBtn.className = "tag-btn active"; 
    allBtn.onclick = function(e) { filterByTag('all', e.target); };
    tagBar.appendChild(allBtn);
    
    Array.from(allTags).sort().forEach(tag => {
        const btn = document.createElement('button');
        btn.textContent = tag.toLowerCase();
        btn.className = "tag-btn";
        btn.onclick = function(e) { filterByTag(tag, e.target); };
        tagBar.appendChild(btn);
    });
}

function renderTable(data) {
    const tableBody = document.getElementById('database-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = ""; 
    data.forEach(project => {
        if (!project.project_name) return;
        
        const row = document.createElement('tr');
        row.className = 'project-row';
        
        if (project.folder) {
            row.classList.add('has-folder'); 
            row.onclick = function() { openProject(project.folder); };
        }
        
        row.setAttribute('data-tags', project.medium ? project.medium : "");
        
        const columns = [project.project_id, project.project_name, project.year, project.place, project.institution, project.collaborators];
        columns.forEach(text => {
            const cell = document.createElement('td');
            cell.textContent = text || "";
            row.appendChild(cell);
        });
        
        tableBody.appendChild(row);
    });
}

function filterByTag(selectedTag, buttonElement) {
    const rows = document.querySelectorAll('.project-row');
    const buttons = document.querySelectorAll('.tag-btn');
    
    buttons.forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');
    
    rows.forEach(row => {
        const rowData = row.getAttribute('data-tags');
        if (selectedTag === 'all' || (rowData && rowData.includes(selectedTag))) {
            row.style.display = ""; 
        } else {
            row.style.display = "none"; 
        }
    });
}

function sortTable(columnIndex) {
    const table = document.getElementById("artist-database");
    
    const headers = table.querySelectorAll('th');
    headers.forEach(th => th.classList.remove('active-sort'));
    headers[columnIndex].classList.add('active-sort');
    
    let switching = true; 
    let direction = "asc"; 
    let switchCount = 0;
    
    while (switching) {
        switching = false; 
        const rows = table.rows; 
        let i, shouldSwitch;
        
        for (i = 1; i < (rows.length - 1); i++) {
            shouldSwitch = false;
            const x = rows[i].getElementsByTagName("TD")[columnIndex];
            const y = rows[i + 1].getElementsByTagName("TD")[columnIndex];
            
            if (!x || !y) continue;

            const xContent = x.textContent.trim().toLowerCase();
            const yContent = y.textContent.trim().toLowerCase();
            
            const xNum = parseFloat(xContent); 
            const yNum = parseFloat(yContent);
            const isNumeric = !isNaN(xNum) && !isNaN(yNum);
            
            if (direction === "asc") {
                if (isNumeric ? xNum > yNum : xContent > yContent) { shouldSwitch = true; break; }
            } else if (direction === "desc") {
                if (isNumeric ? xNum < yNum : xContent < yContent) { shouldSwitch = true; break; }
            }
        }
        
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true; 
            switchCount++;
        } else {
            if (switchCount === 0 && direction === "asc") { 
                direction = "desc"; 
                switching = true; 
            }
        }
    }
}

/* =========================================
   5. NAVIGATION
   ========================================= */
function openArchive() {
    document.getElementById('archive-overlay').style.display = 'flex';
    window.location.hash = 'archive';
}
function closeArchive() {
    document.getElementById('archive-overlay').style.display = 'none';
    history.pushState("", document.title, window.location.pathname);
}

// BIO / ABOUT
let bioLoaded = false;
function openAbout() {
    const overlay = document.getElementById('about-overlay');
    const container = document.getElementById('bio-container');
    
    overlay.style.display = 'flex';

    if (!bioLoaded) {
        cursorElement.classList.add('cursor-loading');
        container.textContent = "Loading..."; 

        Papa.parse(bioSheetURL, {
            download: true,
            header: true, 
            complete: function(results) {
                const text = results.data[0]['content'] || results.data[0]['bio_text'];
                if (text) {
                    container.innerHTML = text; 
                    bioLoaded = true;
                }
                cursorElement.classList.remove('cursor-loading');
            },
            error: function(err) {
                container.textContent = "Error loading biography.";
                cursorElement.classList.remove('cursor-loading');
            }
        });
    }
}
function closeAbout() {
    document.getElementById('about-overlay').style.display = 'none';
}

/* =========================================
   6. PROJECT & CAROUSEL
   ========================================= */
let currentImages = [];
let currentImgIndex = 0;

function convertToDirectLink(url) {
    if (url.includes("drive.google.com") && url.includes("/d/")) {
        const parts = url.split('/d/');
        if (parts.length > 1) {
            const id = parts[1].split('/')[0];
            return `https://drive.google.com/uc?export=view&id=${id}`;
        }
    }
    return url; 
}

function openProject(folderName) {
    if (!folderName) return;
    const project = allProjectData.find(p => p.folder === folderName);
    
    if (project) {
        window.location.hash = folderName;
        document.getElementById('popup-title').textContent = project.project_name;
        document.getElementById('popup-meta').textContent = `${project.year} — ${project.medium}`;
        document.getElementById('popup-description').textContent = project.description || "";
        
        currentImages = [];
        currentImgIndex = 0;
        
        // Match column name 'image_id' from your sheet
        if (project.image_id) {
            currentImages = project.image_id.split(',')
                .map(url => url.trim())
                .filter(url => url.length > 0)
                .map(url => convertToDirectLink(url));
        }

        const imgElement = document.getElementById('carousel-image');
        const counter = document.getElementById('carousel-counter');
        const navButtons = document.querySelectorAll('.carousel-nav');

        if (currentImages.length > 0) {
            imgElement.style.display = 'block';
            navButtons.forEach(btn => btn.style.display = currentImages.length > 1 ? 'block' : 'none');
            loadImage(0);
        } else {
            imgElement.style.display = 'none';
            counter.textContent = "";
            navButtons.forEach(btn => btn.style.display = 'none');
        }

        document.getElementById('project-overlay').style.display = "flex";
    }
}

function loadImage(index) {
    const imgElement = document.getElementById('carousel-image');
    const counter = document.getElementById('carousel-counter');

    if (currentImages.length > 0) {
        counter.textContent = `${index + 1} / ${currentImages.length}`;
    }

    cursorElement.classList.add('cursor-loading');
    imgElement.style.opacity = '0'; 

    const tempImg = new Image();
    tempImg.src = currentImages[index];

    tempImg.onload = function() {
        imgElement.src = currentImages[index];
        imgElement.style.opacity = '1';
        cursorElement.classList.remove('cursor-loading');
    };

    tempImg.onerror = function() {
        console.error("Failed to load image:", currentImages[index]);
        cursorElement.classList.remove('cursor-loading');
    };
}

function nextImage() {
    if (currentImages.length <= 1) return;
    currentImgIndex = (currentImgIndex + 1) % currentImages.length;
    loadImage(currentImgIndex);
}

function prevImage() {
    if (currentImages.length <= 1) return;
    currentImgIndex = (currentImgIndex - 1 + currentImages.length) % currentImages.length;
    loadImage(currentImgIndex);
}

function closeProject() {
    document.getElementById('project-overlay').style.display = "none";
    cursorElement.classList.remove('cursor-loading');
    
    const archiveIsVisible = document.getElementById('archive-overlay').style.display === 'flex';
    if (archiveIsVisible) {
        window.location.hash = 'archive';
    } else {
        history.pushState("", document.title, window.location.pathname);
    }
}

// UNIFIED WINDOW CLICK
window.onclick = function(event) {
    const projectOverlay = document.getElementById('project-overlay');
    const archiveOverlay = document.getElementById('archive-overlay');
    const aboutOverlay = document.getElementById('about-overlay');

    if (event.target === projectOverlay) closeProject();
    else if (event.target === archiveOverlay) closeArchive();
    else if (event.target === aboutOverlay) closeAbout();
}

/* =========================================
   7. CUSTOM CURSOR & CLICK FEEDBACK
   ========================================= */
document.addEventListener('mousemove', (e) => {
    cursorElement.style.left = e.clientX + 'px';
    cursorElement.style.top = e.clientY + 'px';

    const target = e.target;
    const isClickable = target.closest(`
        button, a, .dot, .project-row.has-folder, 
        th, .tag-btn, .title, #archive-trigger, 
        .carousel-nav
    `);

    if (isClickable) {
        cursorElement.classList.add('hover-active');
    } else {
        cursorElement.classList.remove('hover-active');
    }
});

// NEW: Pulse Red when clicking empty space (Non-interactive)
window.addEventListener('mousedown', (e) => {
    // Check if what we clicked is "Interactive"
    const isInteractive = e.target.closest(`
        button, a, .dot, .project-row.has-folder, 
        th, .tag-btn, .title, #archive-trigger, 
        .carousel-nav, .popup-panel
    `);

    // If we clicked empty space (NOT interactive)
    if (!isInteractive) {
        cursorElement.classList.add('cursor-loading');
        
        // Remove pulse after 0.5s (simulating a 'thinking' blip)
        setTimeout(() => {
            cursorElement.classList.remove('cursor-loading');
        }, 500);
    }
});