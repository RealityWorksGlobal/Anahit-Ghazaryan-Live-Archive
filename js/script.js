/* =========================================
 1. CONFIGURATION & INITIALIZATION
   ========================================= */
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=0&single=true&output=csv";
const bioSheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=263826725&single=true&output=csv";

let allProjectData = [];
let cachedBioHTML = ""; // This is where we store the bio for instant access
let bioLoaded = false;
let projectsLoaded = false;

const cursorElement = document.getElementById('custom-cursor');

// START GLOBAL LOADING PULSE
if (cursorElement) cursorElement.classList.add('cursor-loading');

// A. FETCH DATABASE (Archive & Dots)
Papa.parse(sheetURL, {
    download: true,
    header: true,
    complete: function(results) {
        allProjectData = results.data;
        renderTable(allProjectData); 
        renderTags(allProjectData);  
        renderScene(allProjectData); 

        init3D();
        
        const hash = window.location.hash;
        if (hash === '#archive') openArchive();
        else if (hash.length > 1) openProject(hash.substring(1));

        requestAnimationFrame(animateDots);
        projectsLoaded = true;
        checkAllReady();

        /* --- START OF NEW PRELOADER LOGIC --- */
        
        // 1. Setup the Manager to track background loading
        const manager = new THREE.LoadingManager();

        manager.onLoad = function () {
            // Only fade out the loader once everything is cached
            const loaderDiv = document.getElementById('loader');
            if(loaderDiv) {
                loaderDiv.style.opacity = '0';
                setTimeout(() => loaderDiv.remove(), 500);
            }
        };

        // 2. Attach the 3D loader to the manager
        loader = new THREE.GLTFLoader(manager); 

        // 3. Preload Images directly from allProjectData
        function preloadDatabaseImages() {
            let totalToLoad = 0;

            allProjectData.forEach(project => {
                if (project.title_image) {
                    const urls = project.title_image.split(',').map(url => url.trim());
                    
                    urls.forEach(url => {
                        if (url.length > 0) {
                            const directLink = convertToDirectLink(url);
                            totalToLoad++;

                            // Create a memory-only image to force a background download
                            const cacheImg = new Image();
                            
                            // Tell the manager to track this specific file
                            manager.itemStart(directLink);
                            
                            cacheImg.onload = () => manager.itemEnd(directLink);
                            cacheImg.onerror = () => manager.itemEnd(directLink); // Don't hang on broken links
                            
                            cacheImg.src = directLink;
                        }
                    });
                }
            });

            // If there were zero images found in the sheet, trigger onLoad manually
            if (totalToLoad === 0) manager.onLoad();
        }

        // Execute the preload
        preloadDatabaseImages();
        
        /* --- END OF NEW PRELOADER LOGIC --- */
    }
});

// B. PRE-FETCH BIO (This makes it instant later)
Papa.parse(bioSheetURL, {
    download: true,
    header: true,
    complete: function(results) {
        cachedBioHTML = results.data[0]['content'] || results.data[0]['bio_text'];
        bioLoaded = true;
        checkAllReady();
    }
});

// C. STOP PULSE ONLY WHEN EVERYTHING IS IN MEMORY
function checkAllReady() {
    if (projectsLoaded && bioLoaded) {
        if (cursorElement) cursorElement.classList.remove('cursor-loading');
    }
}

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

        // ---------------------------------------------------------
        // START MODIFICATION: BIND DATA FOR CLICKS & 3D HOVER
        // ---------------------------------------------------------
        
        // 1. Attach Folder (Essential for your Click & Hover logic)
        if (project.folder) {
            dot.dataset.folder = project.folder; 
            // 2. Attach 3D File (If exists in Google Sheet)
            const glbFile = project.model_glb; 

            if (glbFile && glbFile.trim() !== "") {
                dot.dataset.glb = glbFile.trim();
                dot.classList.add('has-3d');
            }

            // 3. Attach Click Handler directly to the dot
            dot.onclick = function(e) {
                if (e.pointerType === 'touch') return; 
                openProject(project.folder);
};
        }
        // ---------------------------------------------------------
        // END MODIFICATION
        // ---------------------------------------------------------
        
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
        // --- 3D: FREEZE LOGIC ---
        if (dot.element.classList.contains('is-active-3d')) {
            // We skip the position math entirely for this frame
            // But we still update the DOM position to be safe
            dot.element.style.left = dot.x + '%';
            dot.element.style.top = dot.y + '%';
            return; 
        }
        // -------------------------
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
   5. NAVIGATION (Simple & Reliable)
   ========================================= */

// Single variable memory
let wasArchiveOpenBefore = false;

function closeAllOverlays() {
    const overlays = ['archive-overlay', 'project-overlay', 'about-overlay'];
    overlays.forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    if (cursorElement) cursorElement.classList.remove('cursor-loading');
}

// --- ARCHIVE ---
function openArchive() {
    closeAllOverlays();
    document.getElementById('archive-overlay').style.display = 'flex';
    window.location.hash = 'archive';
}

function closeArchive() {
    document.getElementById('archive-overlay').style.display = 'none';
    history.pushState("", document.title, window.location.pathname);
}

// --- BIO / ABOUT ---
function openAbout() {
    // Memory for navigation
    wasArchiveOpenBefore = (document.getElementById('archive-overlay').style.display === 'flex');
    const projectOpen = (document.getElementById('project-overlay').style.display === 'flex');
    const currentProjectHash = window.location.hash;

    closeAllOverlays();
    const overlay = document.getElementById('about-overlay');
    const container = document.getElementById('bio-container');
    
    // Set return attributes
    if (projectOpen) overlay.setAttribute('data-return', currentProjectHash);
    else if (wasArchiveOpenBefore) overlay.setAttribute('data-return', '#archive');
    else overlay.removeAttribute('data-return');

    // INSTANT DISPLAY
    if (bioLoaded) {
        container.innerHTML = cachedBioHTML;
    } else {
        container.textContent = "Loading...";
    }

    overlay.style.display = 'flex';
}
function closeAbout() {
    const overlay = document.getElementById('about-overlay');
    const returnPath = overlay.getAttribute('data-return');
    
    overlay.style.display = 'none';

    if (returnPath === '#archive') {
        openArchive();
    } else if (returnPath && returnPath.startsWith('#')) {
        openProject(returnPath.substring(1));
    } else {
        history.pushState("", document.title, window.location.pathname);
    }
}

/* =========================================
   6. PROJECT & CAROUSEL
   ========================================= */
let currentImages = [];
let currentImgIndex = 0;

function convertToDirectLink(url) {
    if (url.includes("drive.google.com")) {
        let id = "";
        if (url.includes("/d/")) {
            id = url.split('/d/')[1].split('/')[0];
        } else if (url.includes("id=")) {
            id = url.split('id=')[1].split('&')[0];
        }
        
        if (id) {
            // Using the thumbnail preview link is much more reliable
            // =s2000 tells Google to provide a high-res version (up to 2000px)
            return `https://lh3.googleusercontent.com/u/0/d/${id}=s2000`;
        }
    }
    return url; 
}

function openProject(folderName) {
    // --- 1. Reset Interaction States ---
    isDragging = false;
    isHovering = false;
    interactionType = null;
    didTouchHitDot = false;
    if (typeof cursorElement !== 'undefined' && cursorElement) {
        cursorElement.classList.remove('hover-active', 'cursor-loading');
    }

    if (!folderName) return;
    const project = allProjectData.find(p => p.folder === folderName);
    
    if (project) {
        // --- CRITICAL FIX: Check Archive state BEFORE closing overlays ---
        const archiveOverlay = document.getElementById('archive-overlay');
        const isArchiveOpen = (archiveOverlay && archiveOverlay.style.display === 'flex');

        // Now close everything
        closeAllOverlays();
        
        const projectOverlay = document.getElementById('project-overlay');
        const scrollContainer = document.getElementById('project-scroll-container');
        
        // Reset scroll to top
        if (scrollContainer) scrollContainer.scrollTop = 0;

        // Save the state: Did we come from the Archive?
        if (isArchiveOpen) {
            projectOverlay.setAttribute('data-from-archive', 'true');
        } else {
            projectOverlay.removeAttribute('data-from-archive');
        }

        window.location.hash = folderName;
        
        // --- 3. TOP SECTION: Text ---
        const titleEl = document.getElementById('popup-title');
        const metaEl = document.getElementById('popup-meta');
        const descEl = document.getElementById('popup-description');

        if (titleEl) titleEl.textContent = project.project_name;
        if (metaEl) metaEl.textContent = `${project.year} — ${project.medium}`;
        if (descEl) descEl.innerHTML = (project.description || "").replace(/\n/g, '<br>');

        // --- 4. TOP SECTION: Image & Link ---
        const imgElement = document.getElementById('poster-image');
        const visualContainer = document.querySelector('.project-visuals');

        // Reset Logic
        projectOverlay.classList.remove('no-image');
        if (visualContainer) visualContainer.classList.remove('has-link');
        
        if (imgElement) {
            imgElement.onclick = null;
            imgElement.style.display = 'none'; 
        }

        let currentImages = [];
        
        // ROBUST GETTER: Finds the column even if it has spaces or capitals
        // 1. Get all keys (column names)
        const keys = Object.keys(project);
        // 2. Find the one that looks like 'title_image'
        const imageKey = keys.find(key => key.trim().toLowerCase() === 'title_image');
        // 3. Get the value
        const rawImageString = imageKey ? project[imageKey] : null;

        if (rawImageString) {
            currentImages = rawImageString.split(',')
                .map(u => u.trim())
                .filter(u => u.length > 0)
                .map(u => convertToDirectLink(u));
        }
        if (currentImages.length > 0 && imgElement) {
            imgElement.style.display = 'block';
            imgElement.src = currentImages[0];

            if (project.title_link && project.title_link.trim() !== "") {
                const linkUrl = project.title_link.trim();
                if (visualContainer) visualContainer.classList.add('has-link');
                imgElement.onclick = () => window.open(linkUrl, '_blank');
            }
        } else {
            projectOverlay.classList.add('no-image');
        }

        // --- 5. BOTTOM SECTION (With YouTube Fix) ---
        const bottomSection = document.getElementById('section-bottom');
        if (bottomSection) {
            bottomSection.innerHTML = '';    
            bottomSection.style.display = 'none'; 

            const has = (str) => str && str.trim() !== "";
            
            // Robust ID Extractor
            const getYouTubeID = (url) => {
                const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                const match = url.match(regExp);
                return (match && match[2].length === 11) ? match[2] : null;
            };

            // CHECK 1: Video
            if (has(project.video)) {
                const videoID = getYouTubeID(project.video.trim());
                if (videoID) {
                    bottomSection.style.display = 'flex';
                    const embedUrl = `https://www.youtube.com/embed/${videoID}?rel=0`;
                    bottomSection.innerHTML = `<div class="video-container"><iframe src="${embedUrl}" frameborder="0" allowfullscreen></iframe></div>`;
                }
            } 
            // CHECK 2: Website Image
            else if (has(project.website_image)) {
                bottomSection.style.display = 'flex';
                const img = document.createElement('img');
                img.src = convertToDirectLink(project.website_image.trim());
                img.className = 'bottom-website-image';
                if (has(project.website_link)) {
                    img.classList.add('is-linkable');
                    img.onclick = () => window.open(project.website_link.trim(), '_blank');
                }
                bottomSection.appendChild(img);
            }
            // CHECK 3: Carousel
            else if (has(project.carousel)) {
                bottomSection.style.display = 'flex';
                const cImg = document.createElement('img');
                const cLinks = project.carousel.split(',').map(u => convertToDirectLink(u.trim()));
                cImg.src = cLinks[0];
                cImg.className = 'bottom-website-image';
                bottomSection.appendChild(cImg);
            }
        }

        projectOverlay.style.display = "flex";
    }
}

function closeProject() {
    const projectOverlay = document.getElementById('project-overlay');
    
    // Check if we came from the Archive
    const wasInArchive = projectOverlay.getAttribute('data-from-archive') === 'true';

    // Hide Project
    projectOverlay.style.display = "none";
    
    // Stop any videos playing (Important!)
    const bottomSection = document.getElementById('section-bottom');
    if (bottomSection) bottomSection.innerHTML = '';
    
    // Reset URL
    history.pushState("", document.title, window.location.pathname + window.location.search);

    // If we came from the Archive, RE-OPEN IT
    if (wasInArchive) {
        const archiveOverlay = document.getElementById('archive-overlay');
        if (archiveOverlay) {
            archiveOverlay.style.display = 'flex';
            // Clean up the memory flag
            projectOverlay.removeAttribute('data-from-archive');
        }
    }
}

/* =========================================
   7. UNIFIED CLICK HANDLERS
   ========================================= */

window.onclick = function(event) {
    if (event.target.id === 'project-overlay') closeProject();
    if (event.target.id === 'archive-overlay') closeArchive();
    if (event.target.id === 'about-overlay') closeAbout();
}

document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        const aboutOpen = document.getElementById('about-overlay').style.display === 'flex';
        const projectOpen = document.getElementById('project-overlay').style.display === 'flex';
        const archiveOpen = document.getElementById('archive-overlay').style.display === 'flex';

        if (aboutOpen) closeAbout();
        else if (projectOpen) closeProject();
        else if (archiveOpen) closeArchive();
    }
});

/* =========================================
   8. CURSOR LOGIC
   ========================================= */
document.addEventListener('mousemove', (e) => {
    cursorElement.style.left = e.clientX + 'px';
    cursorElement.style.top = e.clientY + 'px';

    const target = e.target;
    const isClickable = target.closest(`button, a, .dot, .project-row.has-folder, th, .tag-btn, .title, #archive-trigger, .carousel-nav`);

    if (isClickable) cursorElement.classList.add('hover-active');
    else cursorElement.classList.remove('hover-active');
});

window.addEventListener('mousedown', (e) => {
    const isInteractive = e.target.closest(`button, a, .dot, .project-row.has-folder, th, .tag-btn, .title, #archive-trigger, .carousel-nav, .popup-panel`);
    if (!isInteractive) {
        cursorElement.classList.add('cursor-loading');
        setTimeout(() => cursorElement.classList.remove('cursor-loading'), 500);
    }
});

/* =========================================
   9. DYNAMIC 3D HOVER (Final: Fisheye Reflection)
   ========================================= */

const ASSET_PATH = './assets/';
const MODEL_SCALE = 0.5;
const CLOSE_DELAY = 500;

// --- Variables ---
let scene, camera, renderer, loader, raycaster;
let globalEnvMap = null; 
let currentWrapper = null;
let currentModel = null;
let modelCache = {};
let closeTimer = null;

// --- State Flags ---
let targetScale = 0;
let currentScale = 0;
let activeDot = null;
let isDragging = false;
let isHovering = false;
let previousMouse = { x: 0, y: 0 };
let rotVelocity = { x: 0, y: 0 };

// --- Math Tools ---
const mathPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersectPoint = new THREE.Vector3();

function init3D() {
    if (typeof THREE === 'undefined') return;

    // 1. Setup Canvas
    let canvas = document.getElementById('three-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'three-canvas';
        Object.assign(canvas.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: '999'
        });
        document.body.appendChild(canvas);
    }

    // 2. Scene & Renderer
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9; 

    // --- 3. HDRI LOADER (Standard Mapping) ---
    new THREE.RGBELoader()
        .setPath(ASSET_PATH)
        .load('world.hdr', function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping; 
            globalEnvMap = texture; 
            scene.environment = texture;
        });

    // 4. Camera
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 10;
    camera = new THREE.OrthographicCamera(
        viewSize * aspect / -2, viewSize * aspect / 2,
        viewSize / 2, viewSize / -2,
        0.1, 1000
    );
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);

    // 5. Lights (Fallback)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(hemiLight);

    // 6. Tools
    loader = new THREE.GLTFLoader();
    raycaster = new THREE.Raycaster();

    animate3D();
    window.addEventListener('resize', onWindowResize, false);
}

// --- ROCKET SCIENCE FIX: WIDE ANGLE + TILT DOWN ---
function applyFisheyeEffect(geometry) {
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    
    const positionAttribute = geometry.attributes.position;
    const normalAttribute = geometry.attributes.normal;
    
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const sphereNormal = new THREE.Vector3();

    // --- SETTINGS ---
    const tiltY = -0.25; 
    const curvature = 0.1;

    for (let i = 0; i < positionAttribute.count; i++) {
        p.fromBufferAttribute(positionAttribute, i);
        n.fromBufferAttribute(normalAttribute, i);

        // A. Calculate the "Wide Angle" Curve
        sphereNormal.subVectors(p, center).normalize();

        // B. Apply the Curve to the Normal
        n.lerp(sphereNormal, curvature).normalize();

        // C. Apply the Tilt ON TOP of the Curve
        // We gently push the normal downwards
        n.y += tiltY;
        n.normalize();

        normalAttribute.setXYZ(i, n.x, n.y, n.z);
    }
    
    geometry.attributes.normal.needsUpdate = true;
}

// --- MAIN LOOP ---
function animate3D() {
    requestAnimationFrame(animate3D);

    const archiveOpen = document.getElementById('archive-overlay')?.style.display === 'flex';
    const projectOpen = document.getElementById('project-overlay')?.style.display === 'flex';
    const aboutOpen = document.getElementById('about-overlay')?.style.display === 'flex';

    if (archiveOpen || projectOpen || aboutOpen) {
        targetScale = 0;
        currentScale = 0;
        if (currentWrapper) currentWrapper.scale.set(0, 0, 0);
        isHovering = false;
        isDragging = false;
        if (closeTimer) clearTimeout(closeTimer);
    }
    else if (isDragging || isHovering) {
        targetScale = MODEL_SCALE;
    } else {
        targetScale = 0;
    }

    currentScale += (targetScale - currentScale) * 0.03;

    if (currentWrapper && currentModel) {
        rotVelocity.x *= 0.85;
        rotVelocity.y *= 0.85;

        currentModel.rotation.y += rotVelocity.x;
        currentModel.rotation.x += rotVelocity.y;

        currentWrapper.scale.set(currentScale, currentScale, currentScale);

        if (activeDot && currentScale > 0.001) {
            updatePositionWithRaycaster(activeDot);
        }

        if (currentScale > 0.001) {
            renderer.render(scene, camera);
        } else {
            renderer.clear();
            if (currentScale < 0.01 && targetScale === 0) {
                scene.remove(currentWrapper);
                if (activeDot) {
                    activeDot.classList.remove('is-active-3d');
                    activeDot = null;
                }
                currentWrapper = null;
                currentModel = null;
            }
        }
    }
}

function updatePositionWithRaycaster(element) {
    if (!camera || !element || !raycaster) return;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const mouse = new THREE.Vector2();
    mouse.x = (centerX / window.innerWidth) * 2 - 1;
    mouse.y = -(centerY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    raycaster.ray.intersectPlane(mathPlane, planeIntersectPoint);

    if (currentWrapper) {
        currentWrapper.position.copy(planeIntersectPoint);
    }
}

function loadModel(filename) {
    if (modelCache[filename]) {
        spawn(modelCache[filename].clone());
        return;
    }
    loader.load(ASSET_PATH + filename, (gltf) => {
        const m = gltf.scene;

        // --- 1. CENTER GEOMETRY ---
        const box = new THREE.Box3().setFromObject(m);
        const center = box.getCenter(new THREE.Vector3());
        m.position.sub(center); 

        // --- 2. APPLY FISHEYE TO MESHES ---
        m.traverse(c => {
            if (c.isMesh) {
                // Ensure geometry is unique so we don't warp the cached version repeatedly
                c.geometry = c.geometry.clone();
                
                // This is the magic. It bends the light.
                applyFisheyeEffect(c.geometry);
            }
        });

        modelCache[filename] = m;
        const group = new THREE.Group();
        group.add(m.clone());
        
        spawn(group); 
    });
}

function spawn(model) {
    if (currentWrapper) scene.remove(currentWrapper);

    currentWrapper = new THREE.Group();
    scene.add(currentWrapper);

    currentModel = model;

    currentModel.rotation.set(0, Math.PI / 2, 0);

    currentWrapper.add(currentModel);
    currentWrapper.lookAt(camera.position);

    currentScale = 0;
    currentWrapper.scale.set(0, 0, 0);
    rotVelocity = { x: 0, y: 0 };

    updatePositionWithRaycaster(activeDot);
    targetScale = MODEL_SCALE;
}

// --- INTERACTIONS (Kept original) ---
window.addEventListener('mousedown', (e) => {
    if (currentScale > 0.1) {
        isDragging = true;
        previousMouse = { x: e.clientX, y: e.clientY };
        rotVelocity = { x: 0, y: 0 };
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

window.addEventListener('mousemove', (e) => {
    if ((isHovering || isDragging) && currentModel) {
        const deltaX = e.clientX - previousMouse.x;
        const deltaY = e.clientY - previousMouse.y;
        rotVelocity.x += deltaX * 0.003;
        rotVelocity.y += deltaY * 0.003;
    }
    previousMouse = { x: e.clientX, y: e.clientY };
});

document.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('dot')) {
        if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
        previousMouse = { x: e.clientX, y: e.clientY };

        if (isDragging) return;
        if (activeDot === e.target) {
            isHovering = true;
            return;
        }

        const file = e.target.dataset.glb;
        if (file) {
            isHovering = true;
            if (activeDot) activeDot.classList.remove('is-active-3d');
            activeDot = e.target;
            activeDot.classList.add('is-active-3d');
            loadModel(file);
        }
    }
});

document.addEventListener('mouseout', (e) => {
    if (e.target.classList.contains('dot')) {
        closeTimer = setTimeout(() => {
            isHovering = false;
        }, CLOSE_DELAY);
    }
});

function onWindowResize() {
    if (!camera || !renderer) return;
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 10;
    camera.left = -viewSize * aspect / 2;
    camera.right = viewSize * aspect / 2;
    camera.top = viewSize / 2;
    camera.bottom = -viewSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/* =========================================
   10. TOUCH LOGIC (Final: Tap vs Drag)
   ========================================= */

let touchStartTime = 0;
let interactionType = null; // 'new-dot', 'existing-model', or 'empty'
let didTouchHitDot = false;
let hasMoved = false;

// Helper: Find closest dot
function getClosestDot(x, y) {
    let closest = null;
    let minDist = Infinity;
    activeDots.forEach(dot => {
        const rect = dot.element.getBoundingClientRect();
        const dist = Math.hypot(x - (rect.left + rect.width/2), y - (rect.top + rect.height/2));
        if (dist < minDist) { minDist = dist; closest = dot; }
    });
    return minDist < 60 ? closest : null; 
}

// Helper: Create pulse
// A. The Pulse Function (Self-Cleaning)
function triggerPulse(x, y) {
    const pulse = document.createElement('div');
    pulse.className = 'touch-pulse';
    pulse.style.left = x + 'px';
    pulse.style.top = y + 'px';
    document.body.appendChild(pulse);

    // Completely autonomous cleanup
    pulse.addEventListener('animationend', () => pulse.remove());
    setTimeout(() => { if(pulse.parentNode) pulse.remove(); }, 600);
}

// B. The Listener Update
window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    
    // 1. Fire pulse immediately on every single touch
    triggerPulse(t.clientX, t.clientY);

    hasMoved = false;
    const target = getClosestDot(t.clientX, t.clientY);

    // 2. The logic for 3D models
    if (target && target.element.dataset.glb) {
        didTouchHitDot = true;
        e.preventDefault(); 
        
        if (activeDot === target.element && isHovering) {
            interactionType = 'existing-model';
        } else {
            interactionType = 'new-dot';
            if (activeDot) activeDot.classList.remove('is-active-3d');
            activeDot = target.element;
            activeDot.classList.add('is-active-3d');
            isHovering = true;
            loadModel(target.element.dataset.glb);
        }
        isDragging = true;
        previousMouse = { x: t.clientX, y: t.clientY };
        rotVelocity = { x: 0, y: 0 };
    } else {
        interactionType = 'empty';
    }
}, { passive: false });


// --- TOUCH MOVE ---
window.addEventListener('touchmove', (e) => {
    if (isDragging) {
        const dx = e.touches[0].clientX - previousMouse.x;
        const dy = e.touches[0].clientY - previousMouse.y;
        
        // If moved more than 7 pixels, it's a drag, not a tap
        if (Math.hypot(dx, dy) > 7) {
            hasMoved = true;
        }

        if (currentModel && isHovering) {
            e.preventDefault(); 
            rotVelocity.x += dx * 0.003;
            rotVelocity.y += dy * 0.003;
            previousMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }
}, { passive: false });


// --- TOUCH END ---
window.addEventListener('touchend', (e) => {
    // We only preventDefault if we actually hit a dot area to avoid breaking 
    // standard UI buttons like "About" or "Archive"
    if (didTouchHitDot) {
        e.preventDefault(); 
    }

    const t = e.changedTouches[0]; 

    // CASE 1: Tap on the model that was already open
    if (interactionType === 'existing-model') {
        if (!hasMoved) {
            // TAP -> Open Project
            triggerPulse(t.clientX, t.clientY);
            if (activeDot && activeDot.dataset.folder) {
                openProject(activeDot.dataset.folder);
                // Close 3D after opening project
                isHovering = false;
                if (activeDot) activeDot.classList.remove('is-active-3d');
            }
        } 
        // If hasMoved is true here, they were just rotating. Keep it open.
    } 
    
    // CASE 2: Interaction with a new dot
    else if (interactionType === 'new-dot') {
        if (hasMoved) {
            // DRAG RELEASE -> They peeked and dragged, so CLOSE it.
            isHovering = false;
            if (activeDot) {
                activeDot.classList.remove('is-active-3d');
                activeDot = null;
            }
        } else {
            // TAP -> Opened it for the first time. Keep it open.
            triggerPulse(t.clientX, t.clientY);
            isHovering = true;
        }
    } 

    // CASE 3: Tapped or dragged on empty space
    else if (interactionType === 'empty') {
        if (!hasMoved) {
            // TAP ELSEWHERE -> Close everything
            isHovering = false;
            if (activeDot) {
                activeDot.classList.remove('is-active-3d');
                activeDot = null;
            }
        }
    }

    // Reset all flags for the next touch
    isDragging = false;
    interactionType = null;
    didTouchHitDot = false;
    hasMoved = false; 
}, { passive: false });