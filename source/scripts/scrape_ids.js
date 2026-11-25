const fs = require('fs');
const path = require('path');

const HOI4_PATH = 'D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV\\common';
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'hoi4_game_ids.json');

const data = {
    equipment: new Set(),
    ideas: new Set(),
    technologies: new Set()
};

function readFilesRecursively(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(readFilesRecursively(file));
        } else if (file.endsWith('.txt')) {
            results.push(file);
        }
    });
    return results;
}

function parseBlocks(filePath, category) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Remove comments
    const cleanContent = content.replace(/#.*$/gm, '');
    
    // We want to extract top level keys inside the main wrapper (like `equipments = {`, `ideas = {`)
    // A simple regex approach to find all keys before an equals sign:
    const regex = /^\s*([a-zA-Z0-9_]+)\s*=\s*\{/gm;
    let match;
    
    let isInsideMainWrapper = false;
    let braceDepth = 0;
    
    for (let i = 0; i < cleanContent.length; i++) {
        // Very basic brace counting to find block IDs at depth 1 or 2
    }
    
    // Better Regex Strategy: Just match everything that looks like an ID definition
    // Since HOI4 files usually indent inner blocks, we can just grab common keys
    // Let's use regex match all and filter out common keywords
    
    const allMatches = [...cleanContent.matchAll(regex)].map(m => m[1]);
    const blacklist = new Set([
        'equipments', 'ideas', 'technologies', 'country', 'designer', 'political_advisor', 'high_command', 'theorist',
        'army_chief', 'navy_chief', 'air_chief', 'industrial_concern', 'materiel_manufacturer', 'naval_manufacturer',
        'aircraft_manufacturer', 'traits', 'allowed', 'allowed_civil_war', 'modifier', 'research_bonus', 'equipment_bonus',
        'rule', 'on_add', 'limit', 'picture', 'color', 'ai_will_do', 'cost', 'removal_cost', 'available', 'cancel_if_invalid'
    ]);
    
    for (const key of allMatches) {
        if (!blacklist.has(key)) {
            data[category].add(key);
        }
    }
}

async function scrape() {
    console.log("Scraping Equipments...");
    const eqFiles = readFilesRecursively(path.join(HOI4_PATH, 'units', 'equipment'));
    eqFiles.forEach(f => parseBlocks(f, 'equipment'));

    console.log("Scraping Ideas...");
    const ideaFiles = readFilesRecursively(path.join(HOI4_PATH, 'ideas'));
    ideaFiles.forEach(f => parseBlocks(f, 'ideas'));

    console.log("Scraping Technologies...");
    const techFiles = readFilesRecursively(path.join(HOI4_PATH, 'technologies'));
    techFiles.forEach(f => parseBlocks(f, 'technologies'));

    const output = {
        equipment: Array.from(data.equipment),
        ideas: Array.from(data.ideas),
        technologies: Array.from(data.technologies)
    };
    
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`Saved ${output.equipment.length} equipment IDs, ${output.ideas.length} ideas, ${output.technologies.length} technologies to ${OUTPUT_PATH}`);
}

scrape();
