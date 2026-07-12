import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_PAGE = 'https://www.data.go.kr/data/15122916/fileData.do';
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

const LIGHT_RAIL = new Set(['우이신설', '신림선', '김포골드라인', '의정부경전철', '에버라인']);

const EXCLUDED_LINES = new Set(['자기부상']);
const DISTINCT_SAME_NAME = new Set([
	'신촌::2호선',
	'신촌::경의·중앙선',
	'양평::5호선',
	'양평::경의·중앙선'
]);

function parseCsvLine(line) {
	const values = [];
	let value = '';
	let quoted = false;
	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (character === '"') {
			if (quoted && line[index + 1] === '"') {
				value += '"';
				index += 1;
			} else {
				quoted = !quoted;
			}
		} else if (character === ',' && !quoted) {
			values.push(value.trim());
			value = '';
		} else {
			value += character;
		}
	}
	values.push(value.trim());
	return values;
}

function parseCsv(text) {
	const [headerLine, ...lines] = text.replaceAll('\r', '').split('\n').filter(Boolean);
	const headers = parseCsvLine(headerLine);
	return lines.map((line) =>
		Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? '']))
	);
}

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

async function loadSource() {
	const inputIndex = process.argv.indexOf('--input');
	if (inputIndex >= 0 && process.argv[inputIndex + 1]) {
		return {
			bytes: await readFile(resolve(process.argv[inputIndex + 1])),
			downloadUrl: 'local-file',
			pageHtml: ''
		};
	}

	const pageResponse = await fetch(DATA_PAGE, {
		headers: { 'user-agent': 'eodiyeok-station-updater/1.0' }
	});
	if (!pageResponse.ok) throw new Error(`데이터 페이지 요청 실패: ${pageResponse.status}`);
	const pageHtml = await pageResponse.text();
	const downloadUrl = pageHtml.match(/"contentUrl"\s*:\s*"([^"]+)"/)?.[1];
	if (!downloadUrl) throw new Error('공식 CSV 다운로드 주소를 찾지 못했습니다.');

	const csvResponse = await fetch(downloadUrl, {
		headers: { 'user-agent': 'eodiyeok-station-updater/1.0' }
	});
	if (!csvResponse.ok) throw new Error(`CSV 요청 실패: ${csvResponse.status}`);
	return {
		bytes: Buffer.from(await csvResponse.arrayBuffer()),
		downloadUrl,
		pageHtml
	};
}

const { bytes, downloadUrl, pageHtml } = await loadSource();
const decoded = new TextDecoder('euc-kr').decode(bytes);
const rows = parseCsv(decoded)
	.filter((row) => row['권역명'] === '수도권')
	.map((row) => ({
		name: row['역명'].trim(),
		line: normalizedLine(row['노선명'].trim()),
		operator: row['철도운영기관명'].trim()
	}))
	.filter((row) => row.name && row.line && !EXCLUDED_LINES.has(row.line));

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

const preferredOrder = [
	'1호선',
	'2호선',
	'3호선',
	'4호선',
	'5호선',
	'6호선',
	'7호선',
	'8호선',
	'9호선',
	'공항철도',
	'경의·중앙선',
	'경춘선',
	'수인·분당선',
	'신분당선',
	'경강선',
	'서해선',
	'인천1호선',
	'인천2호선',
	'우이신설',
	'신림선',
	'김포골드라인',
	'의정부경전철',
	'에버라인',
	'GTX-A'
];
const lineRank = new Map(preferredOrder.map((line, index) => [line, index]));
const sortLines = (left, right) =>
	(lineRank.get(left) ?? 999) - (lineRank.get(right) ?? 999) || left.localeCompare(right, 'ko');

const lines = [...lineStations.keys()].sort(sortLines).map((name) => ({
	name,
	color: LINE_COLORS[name] ?? '#405060',
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

let existingOutput = null;
try {
	existingOutput = JSON.parse(await readFile(OUTPUT, 'utf8'));
} catch {
	// 첫 생성에서는 기존 파일이 없다.
}

const compactSourceDate = pageHtml.match(/국토교통부_도시철도 전체노선_(\d{8})/)?.[1];
const sourceDate = compactSourceDate
	? `${compactSourceDate.slice(0, 4)}-${compactSourceDate.slice(4, 6)}-${compactSourceDate.slice(6, 8)}`
	: existingOutput?.meta?.sourceDate;
if (!sourceDate) throw new Error('공식 데이터 기준일을 확인할 수 없습니다.');

const output = {
	meta: {
		sourceName: '국토교통부_도시철도 전체노선',
		sourcePage: DATA_PAGE,
		downloadUrl,
		sourceDate,
		generatedAt: new Date().toISOString(),
		stationCount: stations.length,
		lineCount: lines.length,
		excluded: ['운행이 중단된 자기부상 노선']
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
	console.log(`변경 없음: 수도권 ${stations.length}개 역, ${lines.length}개 노선`);
	process.exit(0);
}

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`수도권 ${stations.length}개 역, ${lines.length}개 노선을 갱신했습니다.`);
