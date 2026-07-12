import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const SOURCE_LIST = 'https://data.kric.go.kr/rips/M_04_02/intro.do';
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/data/stations.json');

const LINE_NAMES = {
	공항: '공항철도',
	신분당: '신분당선',
	경강: '경강선',
	경의중앙: '경의·중앙선',
	경춘: '경춘선',
	수인분당: '수인·분당선',
	의정부: '의정부경전철'
};

const LINE_COLORS = {
	'1호선': '#0052A4',
	'2호선': '#00A84D',
	'3호선': '#EF7C1C',
	'4호선': '#00A5DE',
	'5호선': '#996CAC',
	'6호선': '#CD7C2F',
	'7호선': '#747F00',
	'8호선': '#E6186C',
	'9호선': '#8B7C58',
	공항철도: '#0090D2',
	'경의·중앙선': '#67B99A',
	경춘선: '#0C8E72',
	'수인·분당선': '#E9A000',
	신분당선: '#D4003B',
	경강선: '#003DA5',
	서해선: '#83B81A',
	인천1호선: '#759CCE',
	인천2호선: '#ED8B00',
	우이신설: '#A6B23A',
	신림선: '#6789CA',
	김포골드라인: '#A17800',
	의정부경전철: '#F0A000',
	에버라인: '#56AD2D',
	'GTX-A': '#9A6292'
};

const PREFERRED_ORDER = Object.keys(LINE_COLORS);
const INCLUDED_LINES = new Set(PREFERRED_ORDER);
const CAPITAL_OPERATOR_CODES = new Set([
	'AR',
	'DX',
	'EV',
	'GM',
	'GU',
	'GX',
	'IC',
	'KR',
	'NU',
	'S1',
	'S9',
	'SL',
	'SR',
	'SW',
	'UI',
	'UL'
]);
const LIGHT_RAIL = new Set(['우이신설', '신림선', '김포골드라인', '의정부경전철', '에버라인']);
const DISTINCT_SAME_NAME = new Set([
	'신촌::2호선',
	'신촌::경의·중앙선',
	'양평::5호선',
	'양평::경의·중앙선'
]);
const REQUIRED_HEADERS = [
	'RAIL_OPR_ISTT_CD',
	'RAIL_OPR_ISTT_NM',
	'LN_CD',
	'LN_NM',
	'STIN_CD',
	'STIN_NM'
];
const RETRY_DELAYS = [0, 5_000, 15_000];

function normalizedLine(line) {
	return LINE_NAMES[line] ?? line;
}

function lineCategory(line) {
	if (line.startsWith('GTX')) return 'gtx';
	if (line === '공항철도') return 'airport';
	if (LIGHT_RAIL.has(line)) return 'light-rail';
	return 'metro';
}

function physicalStationKey(name, line) {
	const candidate = `${name}::${line}`;
	return DISTINCT_SAME_NAME.has(candidate) ? candidate : name;
}

function wait(milliseconds) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function fetchWithRetry(url, label) {
	let lastError;
	for (const [index, delay] of RETRY_DELAYS.entries()) {
		if (delay > 0) await wait(delay);
		try {
			const response = await fetch(url, {
				headers: { 'user-agent': 'eodiyeok-station-updater/2.0' }
			});
			if (!response.ok) throw new Error(`${label} 요청 실패: ${response.status}`);
			return response;
		} catch (error) {
			lastError = error;
			if (index < RETRY_DELAYS.length - 1) {
				console.warn(`${label} 연결 실패, ${index + 2}번째 시도를 준비합니다.`);
			}
		}
	}
	throw new Error(`${label} 요청을 여러 번 시도했지만 실패했습니다.`, { cause: lastError });
}

function latestSourceFromList(html) {
	const candidates = [];
	for (const match of html.matchAll(
		/<tr[^>]*onclick="[^"]*detail\.do[^"]*id=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/tr>/g
	)) {
		const title = match[2]
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (!title.includes('운영기관, 노선, 역 코드정보 리스트')) continue;
		const date = title.match(/\((\d{4})\.(\d{2})\.(\d{2})\)/);
		if (!date) continue;
		candidates.push({
			id: Number(match[1]),
			sourceDate: `${date[1]}-${date[2]}-${date[3]}`
		});
	}
	return candidates.sort(
		(left, right) => right.sourceDate.localeCompare(left.sourceDate) || right.id - left.id
	)[0];
}

async function discoverLatestSource() {
	const listHtml = await (await fetchWithRetry(SOURCE_LIST, '공식 자료 목록')).text();
	const latest = latestSourceFromList(listHtml);
	if (!latest) throw new Error('최신 역 코드정보 자료를 찾지 못했습니다.');

	const sourcePage = `https://data.kric.go.kr/rips/M_04_02/detail.do?id=${latest.id}`;
	const detailHtml = await (await fetchWithRetry(sourcePage, '공식 자료 상세')).text();
	const fileMatch = detailHtml.match(/href="([^"]*download\.file[^"]*)"[^>]*>([^<]*\.xlsx)<\/a>/i);
	if (!fileMatch) throw new Error('최신 역 코드정보 엑셀 주소를 찾지 못했습니다.');

	const downloadPath = fileMatch[1].replaceAll('&amp;', '&');
	return {
		...latest,
		sourcePage,
		downloadUrl: new URL(downloadPath, sourcePage).href
	};
}

async function loadWorkbookRows(bytes) {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(bytes);

	let sheet;
	let headerIndexes;
	for (const candidate of workbook.worksheets) {
		const indexes = new Map();
		candidate.getRow(1).eachCell((cell, column) => indexes.set(cell.text.trim(), column));
		if (REQUIRED_HEADERS.every((header) => indexes.has(header))) {
			sheet = candidate;
			headerIndexes = indexes;
			break;
		}
	}
	if (!sheet || !headerIndexes) throw new Error('역 코드정보 열을 엑셀에서 찾지 못했습니다.');

	const rows = [];
	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return;
		const value = (header) => row.getCell(headerIndexes.get(header)).text.trim();
		const line = normalizedLine(value('LN_NM'));
		if (!CAPITAL_OPERATOR_CODES.has(value('RAIL_OPR_ISTT_CD')) || !INCLUDED_LINES.has(line)) return;
		const name = value('STIN_NM');
		const operator = value('RAIL_OPR_ISTT_NM');
		if (name && operator) rows.push({ name, line, operator });
	});
	return rows;
}

function buildStationData(rows) {
	const lineStations = new Map();
	const lineOperators = new Map();
	const stationMap = new Map();

	for (const row of rows) {
		if (!lineStations.has(row.line)) lineStations.set(row.line, new Set());
		if (!lineOperators.has(row.line)) lineOperators.set(row.line, new Set());
		lineStations.get(row.line).add(row.name);
		lineOperators.get(row.line).add(row.operator);

		const key = physicalStationKey(row.name, row.line);
		if (!stationMap.has(key)) {
			stationMap.set(key, { id: key, name: row.name, lines: [], operators: [] });
		}
		const station = stationMap.get(key);
		if (!station.lines.includes(row.line)) station.lines.push(row.line);
		if (!station.operators.includes(row.operator)) station.operators.push(row.operator);
	}

	const lineRank = new Map(PREFERRED_ORDER.map((line, index) => [line, index]));
	const sortLines = (left, right) =>
		(lineRank.get(left) ?? 999) - (lineRank.get(right) ?? 999) || left.localeCompare(right, 'ko');

	const lines = [...lineStations.keys()].sort(sortLines).map((name) => ({
		name,
		color: LINE_COLORS[name],
		category: lineCategory(name),
		stationCount: lineStations.get(name).size,
		operators: [...lineOperators.get(name)].sort((a, b) => a.localeCompare(b, 'ko'))
	}));

	const stations = [...stationMap.values()]
		.map((station) => ({
			...station,
			lines: station.lines.sort(sortLines),
			operators: station.operators.sort((a, b) => a.localeCompare(b, 'ko'))
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

	return { lines, stations };
}

const source = await discoverLatestSource();
const inputIndex = process.argv.indexOf('--input');
const bytes =
	inputIndex >= 0 && process.argv[inputIndex + 1]
		? await readFile(resolve(process.argv[inputIndex + 1]))
		: Buffer.from(
				await (await fetchWithRetry(source.downloadUrl, '역 코드정보 엑셀')).arrayBuffer()
			);
const { lines, stations } = buildStationData(await loadWorkbookRows(bytes));

let existingOutput = null;
try {
	existingOutput = JSON.parse(await readFile(OUTPUT, 'utf8'));
} catch {
	// 첫 생성에서는 기존 파일이 없다.
}

const output = {
	meta: {
		sourceName: '철도산업정보센터_운영기관·노선·역 코드정보',
		sourcePage: source.sourcePage,
		downloadUrl: source.downloadUrl,
		sourceDate: source.sourceDate,
		generatedAt: new Date().toISOString(),
		stationCount: stations.length,
		lineCount: lines.length,
		excluded: ['수도권 외 노선', '운행이 중단된 자기부상 노선']
	},
	lines,
	stations
};

const withoutGeneratedAt = (value) => {
	const copy = structuredClone(value);
	if (copy?.meta) delete copy.meta.generatedAt;
	return copy;
};

if (
	existingOutput &&
	JSON.stringify(withoutGeneratedAt(existingOutput)) === JSON.stringify(withoutGeneratedAt(output))
) {
	console.log(
		`변경 없음: ${source.sourceDate} 기준 수도권 ${stations.length}개 역, ${lines.length}개 노선`
	);
	process.exit(0);
}

await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(
	`${source.sourceDate} 기준 수도권 ${stations.length}개 역, ${lines.length}개 노선을 갱신했습니다.`
);
