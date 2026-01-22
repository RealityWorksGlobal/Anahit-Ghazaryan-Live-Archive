/* =========================================
   1. SETTINGS & INITIALIZATION
   ========================================= */
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLUA-xQwP7pwE-0u6ADXVPnWMtiwZc1E5hGzLWg4SvECjXGHS8iVBltD9tiJfO_NqR_PRLJf_Cye2r/pub?gid=0&single=true&output=csv";
let allProjectData = [];

// Start the engine
Papa.parse(sheetURL, {
    download: true,
    header: true,
    complete: function(results) {
        allProjectData = results.data;
        
        // 1. RENDER EVERYTHING
        renderTable(allProjectData); 
        renderTags(allProjectData);  
        renderScene(allProjectData); 
        
        // 2. CHECK URL
        const hash = window.location.hash;
        if (hash === '#archive') {
            openArchive();
        } else if (hash.length > 1) {
            openProject(hash.substring(1));
        }

        // 3. START ANIMATION
        requestAnimationFrame(animateDots);
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

    data.forEach(project => {
        if (!project.project_name) return;

        const dot = document.createElement('div');
        dot.className = 'dot';
        
        // Random Position
        let x = Math.random() * 80 + 10; 
        let y = Math.random() * 80 + 10;
        
        // Very slow drift velocity
        let vx = (Math.random() - 0.5) * 0.06;
        let vy = (Math.random() - 0.5) * 0.06;

        dot.style.left = x + '%';
        dot.style.top = y + '%';
        
        // Initial State
        const hasFolder = !!project.folder;
        dot.style.transform = `translate(-50%, -50%) scale(1)`;
        // Real projects = 100% opacity, Ghosts = 30% opacity
        dot.style.opacity = hasFolder ? 1 : 0.3; 
        
        container.appendChild(dot);

        activeDots.push({
            element: dot,
            x: x, y: y,
            vx: vx, vy: vy,
            folder: project.folder,
            hasFolder: hasFolder
        });
    });
}

/* =========================================
   3. PHYSICS ENGINE (Your Custom Settings)
   ========================================= */
// YOUR SETTINGS
const SENSITIVITY_RADIUS = 100; 
const MAX_SCALE = 1.5;            

function animateDots() {
    const archiveOpen = document.getElementById('archive-overlay').style.display === 'flex';
    const projectOpen = document.getElementById('project-overlay').style.display === 'flex';
    
    if (!archiveOpen && !projectOpen) {
        let isHoveringAny = false;

        activeDots.forEach(dot => {
            // 1. Math
            const dotPixelX = (window.innerWidth * dot.x) / 100;
            const dotPixelY = (window.innerHeight * dot.y) / 100;
            const dist = Math.hypot(mouse.x - dotPixelX, mouse.y - dotPixelY);

            // 2. Defaults
            let speedFactor = 1.0;
            let scale = 1;
            let shadowStyle = 'none'; 

            // 3. Proximity Check
            if (dist < SENSITIVITY_RADIUS) {
                const proximity = 1 - (dist / SENSITIVITY_RADIUS); // 0.0 to 1.0
                
                // PHYSICS: Slow down & Grow
                speedFactor = 1 - proximity; 
                scale = 1 + (proximity * (MAX_SCALE - 1));

                // VISUALS: Only if it has a folder
                if (dot.hasFolder) {
                    isHoveringAny = true;
                    
                    // Shadow Logic (Blue Glow)
                    // Even with small scale, we add a shadow to indicate "hover"
                    const blur = 15 * proximity;   
                    const spread = 2 * proximity; 
                    const alpha = proximity * 5; 
                    
                    shadowStyle = `0 0 ${blur}px ${spread}px rgba(0, 47, 167, ${alpha})`;
                    
                    dot.element.style.opacity = 1;
                } else {
                    // Ghost Dots stay faint
                    dot.element.style.opacity = 0.3;
                }
            } else {
                // Outside Field
                dot.element.style.opacity = dot.hasFolder ? 1 : 0.3;
            }

            // 4. Update Position
            dot.x += dot.vx * speedFactor;
            dot.y += dot.vy * speedFactor;

            // Bounce off edges
            if (dot.x <= 2 || dot.x >= 98) dot.vx *= -1;
            if (dot.y <= 2 || dot.y >= 98) dot.vy *= -1;

            // 5. Apply Styles
            dot.element.style.left = dot.x + '%';
            dot.element.style.top = dot.y + '%';
            dot.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
            dot.element.style.boxShadow = shadowStyle;
            // Note: We REMOVED the backgroundColor change. It stays CSS blue.
        });

        document.body.style.cursor = isHoveringAny ? 'pointer' : 'default';
    }

    requestAnimationFrame(animateDots);
}

// Track Mouse
document.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

// Click Handler
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('dot')) {
        const dotData = activeDots.find(d => d.element === e.target);
        if (dotData && dotData.hasFolder) {
            openProject(dotData.folder);
        }
    }
});


/* =========================================
   4. STANDARD FUNCTIONS (Tags, Table, Archive)
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
    let switching = true; let direction = "asc"; let switchCount = 0;
    while (switching) {
        switching = false; const rows = table.rows; let i, shouldSwitch;
        for (i = 1; i < (rows.length - 1); i++) {
            shouldSwitch = false;
            const x = rows[i].getElementsByTagName("TD")[columnIndex];
            const y = rows[i + 1].getElementsByTagName("TD")[columnIndex];
            const xContent = x.textContent.trim().toLowerCase();
            const yContent = y.textContent.trim().toLowerCase();
            const xNum = parseFloat(xContent); const yNum = parseFloat(yContent);
            const isNumeric = !isNaN(xNum) && !isNaN(yNum);
            if (direction === "asc") {
                if (isNumeric ? xNum > yNum : xContent > yContent) { shouldSwitch = true; break; }
            } else if (direction === "desc") {
                if (isNumeric ? xNum < yNum : xContent < yContent) { shouldSwitch = true; break; }
            }
        }
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true; switchCount++;
        } else {
            if (switchCount === 0 && direction === "asc") { direction = "desc"; switching = true; }
        }
    }
}

function openArchive() {
    document.getElementById('archive-overlay').style.display = 'flex';
    window.location.hash = 'archive';
}
function closeArchive() {
    document.getElementById('archive-overlay').style.display = 'none';
    history.pushState("", document.title, window.location.pathname);
}
function openProject(folderName) {
    if (!folderName) return;
    const project = allProjectData.find(p => p.folder === folderName);
    if (project) {
        window.location.hash = folderName;
        document.getElementById('popup-title').textContent = project.project_name;
        document.getElementById('popup-meta').textContent = `${project.year} — ${project.medium}`;
        document.getElementById('popup-description').textContent = project.description || "";
        document.getElementById('project-overlay').style.display = "flex";
    }
}
function closeProject() {
    document.getElementById('project-overlay').style.display = "none";
    const archiveIsVisible = document.getElementById('archive-overlay').style.display === 'flex';
    if (archiveIsVisible) {
        window.location.hash = 'archive';
    } else {
        history.pushState("", document.title, window.location.pathname);
    }
}
window.onclick = function(event) {
    const projectOverlay = document.getElementById('project-overlay');
    const archiveOverlay = document.getElementById('archive-overlay');
    if (event.target === projectOverlay) closeProject();
    else if (event.target === archiveOverlay) closeArchive();
}