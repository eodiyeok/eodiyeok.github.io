import { appendFile, readFile } from 'node:fs/promises';

const SOURCE_READER = 'https://r.jina.ai/http://www.data.go.kr/data/15122916/fileData.do';
const currentData = JSON.parse(await readFile('src/lib/data/stations.json', 'utf8'));

const response = await fetch(SOURCE_READER, {
	headers: { 'user-agent': 'eodiyeok-station-checker/1.0' }
});
if (!response.ok) throw new Error(`공식 자료 기준일 확인 실패: ${response.status}`);

const text = await response.text();
const compactDate = text.match(/도시철도 전체노선_(\d{8})/)?.[1];
if (!compactDate) throw new Error('공식 자료 기준일을 찾지 못했습니다.');

const sourceDate = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
const needsUpdate = sourceDate !== currentData.meta.sourceDate;
console.log(
	needsUpdate
		? `새 역 데이터가 있습니다: ${currentData.meta.sourceDate} → ${sourceDate}`
		: `최신 상태입니다: ${sourceDate}`
);

if (process.env.GITHUB_OUTPUT) {
	await appendFile(
		process.env.GITHUB_OUTPUT,
		`needs_update=${needsUpdate}\nsource_date=${sourceDate}\n`,
		'utf8'
	);
}
