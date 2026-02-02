/* =========================================
   1. GLOBAL CONFIGURATION & VARIABLES
   ========================================= */
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=0&single=true&output=csv";
const bioSheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=263826725&single=true&output=csv";

// PATHS
const ASSET_PATH = './assets/'; 

// GLOBAL STATE
let activeDots = [];
let mouse = { x: -9999, y: -9999 }; // Fixes "mouse is not defined"
let allProjectData = [];
let cachedBioHTML = ""; 
let bioLoaded = false;
let projectsLoaded = false;
let currentAudioDot = null; // <--- ADD THIS HERE (Move it from bottom to top)
let currentActiveList = [];

/* =========================================
   2. INITIALIZATION & DATA LOADING
   ========================================= */
const cursorElement = document.getElementById('custom-cursor');
if (cursorElement) cursorElement.classList.add('cursor-loading');

// A. FETCH PROJECT DATA
Papa.parse(sheetURL, {
    download: true,
    header: true,
    complete: function(results) {
        allProjectData = results.data;
        
        // Render UI
        renderTable(allProjectData); 
        renderTags(allProjectData);  
        
        // Render Scene (Fixes "renderScene is not defined")
        renderScene(allProjectData); 
        
        // Initialize 3D
        init3D(); 
        
        // Start Physics Loop
        requestAnimationFrame(animateDots);
        
        // Reveal Site
        window.hideLoadingScreen();
    }
});

// B. PRE-FETCH BIO
Papa.parse(bioSheetURL, {
    download: true,
    header: true,
    complete: function(results) {
        if(results.data && results.data[0]) {
            cachedBioHTML = results.data[0]['content'] || results.data[0]['bio_text'];
        }
        bioLoaded = true;
        checkAllReady();
    }
});

function checkAllReady() {
    if (projectsLoaded && bioLoaded) {
        if (cursorElement) cursorElement.classList.remove('cursor-loading');
    }
}

// C. REVEAL FUNCTION
window.hideLoadingScreen = function() {
    const loader = document.getElementById('loading-screen');
    const canvas = document.getElementById('three-canvas');
    const mainScene = document.getElementById('main-scene'); 

    // STAGE 1: Reveal Ghost (Canvas AND Dots)
    if (canvas) {
        canvas.style.opacity = '1'; 
        canvas.style.visibility = 'visible';
    } 
    if (mainScene) mainScene.style.opacity = '1';

    // STAGE 2: Fade Loader
    setTimeout(() => {
        if (loader) loader.style.opacity = '0';
    }, 100);

    // STAGE 3: Focus & Cleanup
    setTimeout(() => {
        if (canvas) canvas.style.filter = 'blur(0px)';
        if (mainScene) mainScene.style.filter = 'blur(0px)';
        
        setTimeout(() => {
            if (loader) loader.remove();
            if (window.cursorElement) {
                window.cursorElement.classList.remove('cursor-loading', 'cursor-loading-pulse');
                Object.assign(window.cursorElement.style, { 
                    position: '', top: '', left: '', transform: '' 
                });
            }
        }, 1500);
    }, 1500); 
};

/* =========================================
   3. SCENE LOGIC (The Dots)
   ========================================= */
function renderScene(data) {
    const container = document.getElementById('dots-container');
    if (!container) return;

    container.innerHTML = ""; 
    activeDots = []; 

    data.forEach(project => {
        if (!project.project_name) return;

        const dot = document.createElement('div');
        dot.className = 'dot';

        // 1. Folder Logic
        if (project.folder) {
            dot.dataset.folder = project.folder; 
            dot.onclick = function(e) {
                if (e.pointerType === 'touch') return; 
                openProject(project.folder);
            };
        }

        // 2. 3D Model Logic
        const glbFile = project.model_glb; 
        if (glbFile && glbFile.trim() !== "") {
            dot.dataset.glb = glbFile.trim();
            dot.classList.add('has-3d');
        }

        // 3. Audio Logic (Local Files)
        let audioObj = null;
        const audioFilename = project.audio;
        if (audioFilename && audioFilename.trim() !== "") {
            dot.classList.add('has-audio');
            
            // Construct path: ./assets/filename.wav
            const localAudioPath = ASSET_PATH + audioFilename.trim();
            
            audioObj = new Audio(localAudioPath);
            audioObj.loop = true; 
            audioObj.volume = 0;  
            audioObj.preload = 'auto'; 
            
            audioObj.addEventListener('error', (e) => {
                console.warn("Audio file missing or blocked:", localAudioPath);
            });
        }

        // 4. Random Position
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
            audio: audioObj,
            hasAudio: !!audioObj
        });
    });
}

/* =========================================
   4. PHYSICS ENGINE & ANIMATION LOOP
   ========================================= */
const SENSITIVITY_RADIUS = 80; 
const AUDIO_RADIUS = 80; 
const MAX_SCALE = 1.1;            

function animateDots() {
    // 1. Check overlays
    const archiveOverlay = document.getElementById('archive-overlay');
    const projectOverlay = document.getElementById('project-overlay');
    const aboutOverlay = document.getElementById('about-overlay');

    const archiveOpen = archiveOverlay ? archiveOverlay.style.display === 'flex' : false;
    const projectOpen = projectOverlay ? projectOverlay.style.display === 'flex' : false;
    const aboutOpen = aboutOverlay ? aboutOverlay.style.display === 'flex' : false;
    const isOverlayOpen = archiveOpen || projectOpen || aboutOpen;
    
    // 2. Hide mouse if overlay is open
    const localMouseX = isOverlayOpen ? -9999 : mouse.x;
    const localMouseY = isOverlayOpen ? -9999 : mouse.y;

    activeDots.forEach(dot => {
        // A. 3D Freeze
        if (dot.element.classList.contains('is-active-3d')) {
            dot.element.style.left = dot.x + '%';
            dot.element.style.top = dot.y + '%';
            return; 
        }

        // B. Position Math
        const dotPixelX = (window.innerWidth * dot.x) / 100;
        const dotPixelY = (window.innerHeight * dot.y) / 100;
        const dist = Math.hypot(localMouseX - dotPixelX, localMouseY - dotPixelY);

        // C. Move Logic
        let speedFactor = 1.0;
        if (dist < SENSITIVITY_RADIUS) {
            speedFactor = 1 - (1 - (dist / SENSITIVITY_RADIUS)); 
        }

        dot.x += dot.vx * speedFactor;
        dot.y += dot.vy * speedFactor;

        // Bounce
        if (dot.x <= 2 || dot.x >= 98) dot.vx *= -1;
        if (dot.y <= 2 || dot.y >= 98) dot.vy *= -1;

        // D. Audio Logic (Volume Fading)
        if (dot.hasAudio && !isOverlayOpen) {
            if (currentAudioDot && currentAudioDot.element === dot.element) {
                return; // Skip to next dot
            }
            if (dist < AUDIO_RADIUS) {
                let vol = 1 - (dist / AUDIO_RADIUS);
                vol = Math.max(0, Math.min(1, vol)); 
                
                if (dot.audio) {
                    dot.audio.volume = vol;
                    if (dot.audio.paused && vol > 0.01) {
                        dot.audio.play().catch(e => { /* Ignore autoplay blocks */ });
                    }
                }
            } else {
                if (dot.audio && !dot.audio.paused) {
                    dot.audio.pause();
                    dot.audio.currentTime = 0; 
                }
            }
        }

        // E. Visual Logic
        let scale = 1;
        let shadowStyle = 'none';

        if (dist < SENSITIVITY_RADIUS) {
            const proximity = 1 - (dist / SENSITIVITY_RADIUS);
            scale = 1 + (proximity * (MAX_SCALE - 1));

            if (dot.hasFolder) {
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

        // Update DOM
        dot.element.style.left = dot.x + '%';
        dot.element.style.top = dot.y + '%';
        dot.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
        dot.element.style.boxShadow = shadowStyle;
    });

    requestAnimationFrame(animateDots);
}

// Global Mouse Tracker (Crucial for Physics)
document.addEventListener('mousemove', (e) => { 
    mouse.x = e.clientX; 
    mouse.y = e.clientY; 
});

/* =========================================
   5. UI HELPER FUNCTIONS (Tags, Table, Nav)
   ========================================= */

function sortTable(n) {
    const table = document.getElementById("artist-database");
    let rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
    switching = true;
    dir = "asc"; 

    // Remove 'active-sort' class from all headers
    const headers = table.getElementsByTagName("th");
    for (let h of headers) h.classList.remove("active-sort");
    // Add to current header
    headers[n].classList.add("active-sort");

    while (switching) {
        switching = false;
        rows = table.rows;
        for (i = 1; i < (rows.length - 1); i++) {
            shouldSwitch = false;
            x = rows[i].getElementsByTagName("td")[n];
            y = rows[i + 1].getElementsByTagName("td")[n];

            let xVal = x.innerHTML.toLowerCase();
            let yVal = y.innerHTML.toLowerCase();

            // Check if numeric (for ID and Year)
            if (!isNaN(parseFloat(xVal)) && !isNaN(parseFloat(yVal))) {
                xVal = parseFloat(xVal);
                yVal = parseFloat(yVal);
            }

            if (dir == "asc") {
                if (xVal > yVal) { shouldSwitch = true; break; }
            } else if (dir == "desc") {
                if (xVal < yVal) { shouldSwitch = true; break; }
            }
        }
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
            switchcount++;
        } else {
            if (switchcount == 0 && dir == "asc") {
                dir = "desc";
                switching = true;
            }
        }
    }
}

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
    currentActiveList = data;
    const tableBody = document.getElementById('database-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = ""; 
    data.forEach(project => {
        if (!project.project_name) return;
        
        const row = document.createElement('tr');
        row.className = 'project-row';

        if (project.folder) row.dataset.folder = project.folder;
        
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

// Navigation Memory
let wasArchiveOpenBefore = false;

function closeAllOverlays() {
    ['archive-overlay', 'project-overlay', 'about-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    if (cursorElement) cursorElement.classList.remove('cursor-loading');
}

function openArchive() {
    closeAllOverlays();
    document.getElementById('archive-overlay').style.display = 'flex';
    window.location.hash = 'archive';
}

function handleArchiveFade() {
    const wrapper = document.querySelector('.database-wrapper');
    if (!wrapper) return;

    const updateFade = () => {
        const scrollPos = wrapper.scrollTop + wrapper.clientHeight;
        const totalHeight = wrapper.scrollHeight;

        // If we are more than 10px away from the bottom, show the fade
        if (totalHeight - scrollPos > 10) {
            wrapper.classList.add('is-faded');
        } else {
            wrapper.classList.remove('is-faded');
        }
    };

    // Listen for scroll
    wrapper.addEventListener('scroll', updateFade);
    
    // Run once immediately to check if the list is short (no scroll needed)
    updateFade();
}

function closeArchive() {
    document.getElementById('archive-overlay').style.display = 'none';
    history.pushState("", document.title, window.location.pathname);
}

function openAbout() {
    const archiveEl = document.getElementById('archive-overlay');
    const projectEl = document.getElementById('project-overlay');
    
    wasArchiveOpenBefore = (archiveEl && archiveEl.style.display === 'flex');
    const projectOpen = (projectEl && projectEl.style.display === 'flex');
    const currentProjectHash = window.location.hash;

    closeAllOverlays();
    const overlay = document.getElementById('about-overlay');
    const container = document.getElementById('bio-container');
    
    if (projectOpen) overlay.setAttribute('data-return', currentProjectHash);
    else if (wasArchiveOpenBefore) overlay.setAttribute('data-return', '#archive');
    else overlay.removeAttribute('data-return');

    if (bioLoaded) container.innerHTML = cachedBioHTML;
    else container.textContent = "Loading...";

    overlay.style.display = 'flex';
}

function closeAbout() {
    const overlay = document.getElementById('about-overlay');
    const returnPath = overlay.getAttribute('data-return');
    overlay.style.display = 'none';

    if (returnPath === '#archive') openArchive();
    else if (returnPath && returnPath.startsWith('#')) openProject(returnPath.substring(1));
    else history.pushState("", document.title, window.location.pathname);
}

/* =========================================
   6. PROJECT OVERLAY & CONTENT (UPDATED)
   ========================================= */

// Helper: Fix Google Drive Links
function convertToDirectLink(url) {
    if (url && url.includes("drive.google.com")) {
        let id = "";
        if (url.includes("/d/")) id = url.split('/d/')[1].split('/')[0];
        else if (url.includes("id=")) id = url.split('id=')[1].split('&')[0];
        if (id) return `https://lh3.googleusercontent.com/u/0/d/${id}=s2000`;
    }
    return url; 
}

// Helper: Carousel Builder (Logic from previous step)
function initCarousel(container, images) {
    container.innerHTML = ''; // Clear
    
    // Create Image
    const imgElement = document.createElement('img');
    imgElement.src = images[0];
    imgElement.className = "visual-content carousel-img"; 
    container.appendChild(imgElement);

    // Create Invisible Hover Zones
    const leftZone = document.createElement('div');
    leftZone.className = "carousel-click-zone zone-left";
    const rightZone = document.createElement('div');
    rightZone.className = "carousel-click-zone zone-right";
    container.appendChild(leftZone);
    container.appendChild(rightZone);

    // Logic
    let currentIndex = 0;
    
    function updateImage() {
        imgElement.style.opacity = 0.5;
        setTimeout(() => {
            imgElement.src = images[currentIndex];
            imgElement.style.opacity = 1;
        }, 200);
    }
    function goNext() { currentIndex = (currentIndex + 1) % images.length; updateImage(); }
    function goPrev() { currentIndex = (currentIndex - 1 + images.length) % images.length; updateImage(); }

    // Events
    const cursor = document.getElementById('custom-cursor');
    rightZone.addEventListener('mouseenter', () => cursor.classList.add('cursor-arrow-next'));
    rightZone.addEventListener('mouseleave', () => cursor.classList.remove('cursor-arrow-next'));
    rightZone.addEventListener('click', goNext);

    leftZone.addEventListener('mouseenter', () => cursor.classList.add('cursor-arrow-prev'));
    leftZone.addEventListener('mouseleave', () => cursor.classList.remove('cursor-arrow-prev'));
    leftZone.addEventListener('click', goPrev);
}


// MAIN FUNCTION: OPEN PROJECT
function openProject(folderName) {
    if (!folderName) return;
    const project = allProjectData.find(p => p.folder === folderName);
    
    if (project) {
        // 1. Manage Overlays
        const archiveOverlay = document.getElementById('archive-overlay');
        const isArchiveOpen = (archiveOverlay && archiveOverlay.style.display === 'flex');
        closeAllOverlays(); // Close others
        
        const projectOverlay = document.getElementById('project-overlay');
        if (isArchiveOpen) projectOverlay.setAttribute('data-from-archive', 'true');
        else projectOverlay.removeAttribute('data-from-archive');

        window.location.hash = folderName;
        
        // 2. Populate Text Columns
        
        // A. Title
        const titleEl = document.getElementById('popup-title');
        if(titleEl) titleEl.textContent = project.project_name;

        // B. Description
        const descEl = document.getElementById('popup-description');
        if (descEl) descEl.innerHTML = (project.description || "").replace(/\n/g, '<br>');

        // C. Meta Data List (The New "Form" Layout)
        const metaContainer = document.getElementById('meta-container');
        if (metaContainer) {
            metaContainer.innerHTML = ''; 

            // UPDATED HELPER: Accepts 'isStacked' (true/false)
            const addMetaRow = (label, value, isStacked = false) => {
                if (!value || value.trim() === "") return; 
                
                const row = document.createElement('div');
        
                row.className = 'meta-row';
                const formattedValue = String(value).replace(/\n/g, '<br>');
                
                row.innerHTML = `
                    <span class="meta-label">${label}</span>
                    <span class="meta-value">${value}</span>
                `;
                metaContainer.appendChild(row);
            };

            // --- DEFINE YOUR COLUMNS HERE ---
            
            // Standard Rows (Side-by-side)
            addMetaRow("Year",      project.year, true);
            addMetaRow("Medium",    project.medium, true);
            addMetaRow("Place",     project.place);
            addMetaRow("Institution",   project.institution,   true); 
            addMetaRow("Credits", project.credits, true);
        }

        // 3. Populate Visual Column (MERGED CAROUSEL LOGIC)
        const visualContainer = document.getElementById('popup-visual-container');
        if (visualContainer) {
            visualContainer.innerHTML = ''; // Clear old content
            visualContainer.className = "col-visual"; 

            // HELPER: Check for valid strings
            const has = (str) => str && str.trim() !== "";
            const getYouTubeID = (url) => {
                const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
                return (match && match[2].length === 11) ? match[2] : null;
            };

            // --- A. VIDEO (Stays separate at the top) ---
            if (has(project.video)) {
                const videoID = getYouTubeID(project.video.trim());
                if (videoID) {
                    const vidWrapper = document.createElement('div');
                    vidWrapper.className = "video-wrapper";
                    // Style: 16/9 aspect ratio, black background
                    vidWrapper.style.cssText = "width:100%; aspect-ratio:16/9; background:black; flex-shrink:0; margin-bottom:20px;";
                    vidWrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoID}?rel=0" frameborder="0" allowfullscreen style="width:100%; height:100%;"></iframe>`;
                    visualContainer.appendChild(vidWrapper);
                }
            }

            // --- B. PREPARE IMAGES (Merge Title + Carousel) ---
            let allSlides = [];

            // 1. Add Title Image (First)
            // We use the case-insensitive search just to be safe
            const keys = Object.keys(project);
            const imageKey = keys.find(key => key.trim().toLowerCase() === 'title_image');
            if (imageKey && has(project[imageKey])) {
                const titleImgUrl = project[imageKey].split(',')[0].trim();
                allSlides.push(convertToDirectLink(titleImgUrl));
            }

            // 2. Add Carousel Images (After)
            if (has(project.carousel)) {
                const carouselUrls = project.carousel.split(',').map(u => convertToDirectLink(u.trim()));
                allSlides = allSlides.concat(carouselUrls);
            }

            // --- C. RENDER THE CAROUSEL ---
            if (allSlides.length > 0) {
                // Create the container
                const carouselWrapper = document.createElement('div');
                carouselWrapper.className = 'carousel-container';
                
                // Style: Fill the width, but restrict height so it doesn't overflow the screen
                // 'flex-shrink: 0' ensures it doesn't get squashed if there is also a video
                carouselWrapper.style.cssText = "width:100%; height:100%; min-height:300px; position:relative; flex-shrink:0;"; 
                
                visualContainer.appendChild(carouselWrapper);
                
                // Initialize with the MERGED list
                initCarousel(carouselWrapper, allSlides);
            }
            
            // --- D. WEBSITE PREVIEW (Optional Fallback) ---
            // Only add this if we have absolutely no other images/video
            else if (has(project.website_image) && !has(project.video)) {
                const img = document.createElement('img');
                img.src = convertToDirectLink(project.website_image.trim());
                img.className = "visual-content website-link-img";
                if (has(project.website_link)) {
                    img.onclick = () => window.open(project.website_link.trim(), '_blank');
                }
                visualContainer.appendChild(img);
            }
        }

        projectOverlay.style.display = "flex";
    }
}

// Navigation Logic
function goToNextProject(direction) {
    // 1. Identify where we are
    const currentFolder = window.location.hash.replace('#', '');
    if (!currentFolder) return;

    // 2. Find our position in the CURRENT list (Sorted/Filtered)
    const currentIndex = currentActiveList.findIndex(p => p.folder === currentFolder);

    // If the current project isn't in the active list (e.g. filtered out),
    // fallback to the main data list so we don't get stuck.
    const listToUse = (currentIndex === -1) ? allProjectData : currentActiveList;
    const safeIndex = (currentIndex === -1) ? allProjectData.findIndex(p => p.folder === currentFolder) : currentIndex;

    // 3. Calculate new index (with looping)
    let newIndex = safeIndex + direction;
    
    // Loop around if at the end or beginning
    if (newIndex >= listToUse.length) newIndex = 0;
    if (newIndex < 0) newIndex = listToUse.length - 1;

    // 4. Open the new project
    const nextProject = listToUse[newIndex];
    if (nextProject) {
        openProject(nextProject.folder);
    }
}

// Close Logic
function closeProject() {
    const projectOverlay = document.getElementById('project-overlay');
    const wasInArchive = projectOverlay.getAttribute('data-from-archive') === 'true';

    projectOverlay.style.display = "none";
    
    // Clean URL
    history.pushState("", document.title, window.location.pathname + window.location.search);

    // If we came from Archive, re-open it. Otherwise go to Home.
    if (wasInArchive) openArchive();
}

/* =========================================
   7. EVENTS & CURSOR
   ========================================= */
window.onclick = function(event) {
    if (event.target.id === 'project-overlay') closeProject();
    if (event.target.id === 'archive-overlay') closeArchive();
    if (event.target.id === 'about-overlay') closeAbout();
}

document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        if (document.getElementById('about-overlay').style.display === 'flex') closeAbout();
        else if (document.getElementById('project-overlay').style.display === 'flex') closeProject();
        else if (document.getElementById('archive-overlay').style.display === 'flex') closeArchive();
    }
});

// Cursor
document.addEventListener('mousemove', (e) => {
    if (cursorElement) {
        cursorElement.style.left = e.clientX + 'px';
        cursorElement.style.top = e.clientY + 'px';
        
        const isClickable = e.target.closest(`button, a, .dot, .project-row.has-folder, th, .tag-btn, .title, #fixed-archive-dot, .carousel-nav`);
        if (isClickable) cursorElement.classList.add('hover-active');
        else cursorElement.classList.remove('hover-active');
    }
});

/* =========================================
   8. DYNAMIC 3D HOVER (Fisheye Reflection)
   ========================================= */
const MODEL_SCALE = 0.7;
const CLOSE_DELAY = 500;

let scene, camera, renderer, loader, raycaster;
let globalEnvMap = null; 
let currentWrapper = null;
let currentModel = null;
let modelCache = {};
let closeTimer = null;

let targetScale = 0;
let currentScale = 0;
let activeDot = null;
let isDragging = false;
let isHovering = false;
let previousMouse = { x: 0, y: 0 };
let rotVelocity = { x: 0, y: 0 };

const mathPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersectPoint = new THREE.Vector3();

function init3D() {
    if (typeof THREE === 'undefined') return;

    let canvas = document.getElementById('three-canvas');
    if (!canvas) return; // Should exist in HTML

    // Styling managed by CSS and hideLoadingScreen, but ensuring basics here
    canvas.style.opacity = '0';
    canvas.style.filter = 'blur(10px)';

    scene = new THREE.Scene();
    
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); 
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9; 

    new THREE.RGBELoader()
        .setPath(ASSET_PATH)
        .load('world.hdr', function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping; 
            globalEnvMap = texture; 
            scene.environment = texture;
        });

    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = 10;
    camera = new THREE.OrthographicCamera(
        viewSize * aspect / -2, viewSize * aspect / 2,
        viewSize / 2, viewSize / -2,
        0.1, 1000
    );
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(hemiLight);

    loader = new THREE.GLTFLoader();
    raycaster = new THREE.Raycaster();

    animate3D();
    window.addEventListener('resize', onWindowResize, false);
}

function applyFisheyeEffect(geometry) {
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    const positionAttribute = geometry.attributes.position;
    const normalAttribute = geometry.attributes.normal;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const sphereNormal = new THREE.Vector3();

    const tiltY = -0.25; 
    const curvature = 0.1;

    for (let i = 0; i < positionAttribute.count; i++) {
        p.fromBufferAttribute(positionAttribute, i);
        n.fromBufferAttribute(normalAttribute, i);
        sphereNormal.subVectors(p, center).normalize();
        n.lerp(sphereNormal, curvature).normalize();
        n.y += tiltY;
        n.normalize();
        normalAttribute.setXYZ(i, n.x, n.y, n.z);
    }
    geometry.attributes.normal.needsUpdate = true;
}

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

    if (currentWrapper) currentWrapper.position.copy(planeIntersectPoint);
}

function loadModel(filename) {
    if (modelCache[filename]) {
        spawn(modelCache[filename].clone());
        return;
    }
    loader.load(ASSET_PATH + filename, (gltf) => {
        const m = gltf.scene;
        const box = new THREE.Box3().setFromObject(m);
        const center = box.getCenter(new THREE.Vector3());
        m.position.sub(center); 
        m.traverse(c => {
            if (c.isMesh) {
                c.geometry = c.geometry.clone();
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

// 3D Input Listeners
window.addEventListener('mousedown', (e) => {
    if (currentScale > 0.1) {
        isDragging = true;
        previousMouse = { x: e.clientX, y: e.clientY };
        rotVelocity = { x: 0, y: 0 };
    }
});
window.addEventListener('mouseup', () => isDragging = false);
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
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        previousMouse = { x: e.clientX, y: e.clientY };
        if (isDragging) return;
        if (activeDot === e.target) { isHovering = true; return; }

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
        closeTimer = setTimeout(() => { isHovering = false; }, CLOSE_DELAY);
    }
});

document.addEventListener('mousedown', (e) => {
    // 1. Safety check: Ensure triggerPulse exists
    if (typeof triggerPulse === 'function') {
        // 2. Only fire for mouse (touch handles itself)
        // Note: e.detail > 1 detects double clicks if needed, 
        // but simple mousedown is snappiest.
        triggerPulse(e.clientX, e.clientY);
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
   9. TOUCH LOGIC (Mobile Tap vs Drag)
   ========================================= */
let interactionType = null;
let didTouchHitDot = false;
let hasMoved = false;

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

function triggerPulse(x, y) {
    const pulse = document.createElement('div');
    pulse.className = 'touch-pulse';
    pulse.style.left = x + 'px';
    pulse.style.top = y + 'px';
    document.body.appendChild(pulse);
    pulse.addEventListener('animationend', () => pulse.remove());
}

window.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    triggerPulse(t.clientX, t.clientY);
    hasMoved = false;
    const target = getClosestDot(t.clientX, t.clientY);

    // 1. 3D Model Dot
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
    } 
    // 2. Audio Dot
    else if (target && target.hasAudio) {
        didTouchHitDot = true;
        e.preventDefault();
        
        if (currentAudioDot === target) interactionType = 'audio-open';
        else interactionType = 'audio-play';
        activeDot = target.element; 
    }
    // 3. Empty Space
    else {
        interactionType = 'empty';
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (isDragging) {
        const dx = e.touches[0].clientX - previousMouse.x;
        const dy = e.touches[0].clientY - previousMouse.y;
        if (Math.hypot(dx, dy) > 7) hasMoved = true;

        if (currentModel && isHovering) {
            e.preventDefault(); 
            rotVelocity.x += dx * 0.003;
            rotVelocity.y += dy * 0.003;
            previousMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (didTouchHitDot) e.preventDefault();
    const t = e.changedTouches[0]; 

    // AUDIO LOGIC
    if (interactionType === 'audio-play') {
        if (!hasMoved) {
            if (currentAudioDot && currentAudioDot.audio) {
                currentAudioDot.audio.pause();
                currentAudioDot.audio.currentTime = 0;
            }
            const dotData = activeDots.find(d => d.element === activeDot);
            if (dotData && dotData.audio) {
                dotData.audio.volume = 1.0;
                dotData.audio.play();
                currentAudioDot = dotData;
            }
        }
    }
    else if (interactionType === 'audio-open') {
        if (!hasMoved) {
            if (currentAudioDot && currentAudioDot.audio) currentAudioDot.audio.pause();
            const dotData = activeDots.find(d => d.element === activeDot);
            if (dotData && dotData.folder) openProject(dotData.folder);
            currentAudioDot = null;
        }
    }

    // 3D LOGIC
    else if (interactionType === 'existing-model') {
        if (!hasMoved) {
            triggerPulse(t.clientX, t.clientY);
            if (activeDot && activeDot.dataset.folder) {
                openProject(activeDot.dataset.folder);
                isHovering = false;
                activeDot.classList.remove('is-active-3d');
            }
        } 
    } 
    else if (interactionType === 'new-dot') {
        if (hasMoved) {
            isHovering = false;
            if (activeDot) {
                activeDot.classList.remove('is-active-3d');
                activeDot = null;
            }
        } else {
            triggerPulse(t.clientX, t.clientY);
            isHovering = true;
        }
    } 

    // EMPTY SPACE
    else if (interactionType === 'empty') {
        if (!hasMoved) {
            if (currentAudioDot && currentAudioDot.audio) {
                currentAudioDot.audio.pause();
                currentAudioDot = null;
            }
            isHovering = false;
            if (activeDot) {
                activeDot.classList.remove('is-active-3d');
                activeDot = null;
            }
        }
    }

    isDragging = false;
    interactionType = null;
    didTouchHitDot = false;
    hasMoved = false; 
}, { passive: false });

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        activeDots.forEach(d => {
            if (d.audio && !d.audio.paused) d.audio.pause();
        });
    }
});

/* =========================================
   GLOBAL PROJECT SWIPE (TOUCH & MOUSE)
   ========================================= */
const projectOverlay = document.getElementById('project-overlay');

// Variables to track movement
let swipeStartX = 0;
let swipeStartY = 0;

// --- 1. UNIFIED HANDLERS ---

function handleSwipeStart(x, y) {
    swipeStartX = x;
    swipeStartY = y;
    isDragging = true;
}

function handleSwipeEnd(x, y, target) {
    if (!isDragging) return;
    isDragging = false;

    // A. SAFETY: Ignore if swiping inside a Carousel (let the carousel handle it)
    if (target.closest('.carousel-container')) return;

    // B. SAFETY: Ignore if user is highlighting text (Desktop specific)
    const selection = window.getSelection().toString();
    if (selection.length > 0) return; 

    // C. CALCULATE MOVEMENT
    const diffX = swipeStartX - x;
    const diffY = swipeStartY - y;

    // D. DETERMINE INTENT
    // Rule: Movement must be mostly Horizontal (> Vertical) and at least 50px long
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
            // Dragged Left -> Next Project
            goToNextProject(1);
        } else {
            // Dragged Right -> Prev Project
            goToNextProject(-1);
        }
    }
}

// --- 2. TOUCH LISTENERS (Mobile/Tablet) ---
projectOverlay.addEventListener('touchstart', (e) => {
    handleSwipeStart(e.changedTouches[0].screenX, e.changedTouches[0].screenY);
}, { passive: true });

projectOverlay.addEventListener('touchend', (e) => {
    handleSwipeEnd(e.changedTouches[0].screenX, e.changedTouches[0].screenY, e.target);
}, { passive: true });

// --- 3. MOUSE LISTENERS (Desktop Click & Drag) ---
projectOverlay.addEventListener('mousedown', (e) => {
    // Only trigger on Left Click (button 0)
    if (e.button === 0) {
        handleSwipeStart(e.screenX, e.screenY);
    }
});

// We attach 'mouseup' to window so it works even if you drag off the card
window.addEventListener('mouseup', (e) => {
    if (isDragging) {
        handleSwipeEnd(e.screenX, e.screenY, e.target);
    }
});