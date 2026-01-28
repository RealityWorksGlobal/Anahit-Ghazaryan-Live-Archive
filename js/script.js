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
            if (project.glb_file && project.glb_file.trim() !== "") {
                dot.dataset.glb = project.glb_file.trim();
                dot.classList.add('has-3d'); // (Optional) Helper class
            }

            // 3. Attach Click Handler directly to the dot
            dot.onclick = function() {
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
    if (!folderName) return;
    const project = allProjectData.find(p => p.folder === folderName);
    
    if (project) {
        // Remember if we came from Archive
        const fromArchive = (document.getElementById('archive-overlay').style.display === 'flex');
        
        closeAllOverlays();
        const projectOverlay = document.getElementById('project-overlay');
        
        if (fromArchive) {
            projectOverlay.setAttribute('data-from-archive', 'true');
        } else {
            projectOverlay.removeAttribute('data-from-archive');
        }

        window.location.hash = folderName;
        document.getElementById('popup-title').textContent = project.project_name;
        document.getElementById('popup-meta').textContent = `${project.year} — ${project.medium}`;
        const formattedDescription = (project.description || "").replace(/\n/g, '<br>');
        document.getElementById('popup-description').innerHTML = formattedDescription;

        currentImages = [];
        currentImgIndex = 0;
        if (project.image_id) {
            currentImages = project.image_id.split(',').map(url => url.trim()).filter(url => url.length > 0).map(url => convertToDirectLink(url));
        }

        const imgElement = document.getElementById('carousel-image');
        const counter = document.getElementById('carousel-counter');
        const navButtons = document.querySelectorAll('.carousel-nav');

        if (currentImages.length > 0) {
            imgElement.style.display = 'block';
            navButtons.forEach(btn => btn.style.display = currentImages.length > 1 ? 'block' : 'none');
            counter.style.display = (currentImages.length > 1) ? 'block' : 'none';
            loadImage(0);
        } else {
            imgElement.style.display = 'none';
            counter.textContent = "";
            navButtons.forEach(btn => btn.style.display = 'none');
        }
        projectOverlay.style.display = "flex";
    }
}

function loadImage(index) {
    const imgElement = document.getElementById('carousel-image');
    const counter = document.getElementById('carousel-counter');
    if (currentImages.length > 0) counter.textContent = `${index + 1} / ${currentImages.length}`;

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
    const projectOverlay = document.getElementById('project-overlay');
    const fromArchive = projectOverlay.getAttribute('data-from-archive');
    
    projectOverlay.style.display = "none";
    cursorElement.classList.remove('cursor-loading');
    
    if (fromArchive === 'true') {
        openArchive();
    } else {
        history.pushState("", document.title, window.location.pathname);
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
   10. SMART TOUCH (Tap=Stay, Hold=Close)
   ========================================= */

let touchStartTime = 0;
let isInteractingWithOpenModel = false;
let didTouchHitDot = false;

// Helper: Find closest dot within radius
function getClosestDot(x, y) {
    let closest = null;
    let minDist = Infinity;
    
    activeDots.forEach(dot => {
        const rect = dot.element.getBoundingClientRect();
        const dotX = rect.left + rect.width / 2;
        const dotY = rect.top + rect.height / 2;
        const dist = Math.hypot(x - dotX, y - dotY);
        
        if (dist < minDist) {
            minDist = dist;
            closest = dot;
        }
    });

    // 60px Radius for comfortable hitting
    return minDist < 60 ? closest : null; 
}

// --- TOUCH START ---
window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStartTime = Date.now();
    didTouchHitDot = false;
    
    // 1. Check if we hit a dot (or the open model)
    const target = getClosestDot(t.clientX, t.clientY);

    // CASE A: We hit a dot (either new or existing)
    if (target && target.element.dataset.glb) {
        didTouchHitDot = true;
        
        // Is this the ALREADY open dot?
        if (activeDot === target.element && isHovering) {
            // Yes. We are grabbing the open model to move it.
            isInteractingWithOpenModel = true;
        } else {
            // No. It's a NEW dot. Open it immediately.
            isInteractingWithOpenModel = false; // Reset this flag
            
            // Clean up old
            if (activeDot) activeDot.classList.remove('is-active-3d');
            
            activeDot = target.element;
            activeDot.classList.add('is-active-3d');
            isHovering = true; // Show model
            loadModel(target.element.dataset.glb);
        }

        // Initialize drag physics
        isDragging = true;
        previousMouse = { x: t.clientX, y: t.clientY };
        rotVelocity = { x: 0, y: 0 };
    } 
    // CASE B: We touched empty space
    else {
        // Prepare to close everything on release (or immediately if you prefer)
        // We do nothing here, let TouchEnd handle the cleanup
    }
}, { passive: false });


// --- TOUCH MOVE (Rotate) ---
window.addEventListener('touchmove', (e) => {
    // Only rotate if we are actively dragging a model
    if (isDragging && currentModel && isHovering) {
        e.preventDefault(); // Block scrolling
        
        const deltaX = e.touches[0].clientX - previousMouse.x;
        const deltaY = e.touches[0].clientY - previousMouse.y;
        
        rotVelocity.x += deltaX * 0.003;
        rotVelocity.y += deltaY * 0.003;
        
        previousMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
}, { passive: false });


// --- TOUCH END (The Logic Brain) ---
window.addEventListener('touchend', () => {
    const touchDuration = Date.now() - touchStartTime;
    const isTap = touchDuration < 250; // Short press (< 250ms)

    if (didTouchHitDot) {
        if (isInteractingWithOpenModel) {
            // USER RULE: "if you touch it after opening... on release, it vanishes"
            isHovering = false;
            if (activeDot) {
                activeDot.classList.remove('is-active-3d');
                activeDot = null;
            }
        } else {
            // It was a NEW dot.
            if (isTap) {
                // USER RULE: "if you only have a touch on a dot, the 3d model appears" (Persistent)
                isHovering = true; 
            } else {
                // USER RULE: "if you hold on the button, model disappears on release"
                isHovering = false;
                if (activeDot) {
                    activeDot.classList.remove('is-active-3d');
                    activeDot = null;
                }
            }
        }
    } else {
        // USER RULE: "to get it go away tap anywhere else"
        isHovering = false;
        if (activeDot) {
            activeDot.classList.remove('is-active-3d');
            activeDot = null;
        }
    }

    // Reset flags
    isDragging = false;
    isInteractingWithOpenModel = false;
});