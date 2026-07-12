<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import stationData from '$lib/data/stations.json';
	import {
		formatSourceDate,
		pickRandomStation,
		stationsForLines,
		type LineCategory,
		type Station,
		type TransitLine
	} from '$lib/stations';

	type InstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};

	type SavedSettings = {
		selectedLines: string[];
		includeAirport: boolean;
		includeLightRail: boolean;
		includeGtx: boolean;
		avoidRecent: boolean;
	};

	const stations = stationData.stations as Station[];
	const lineOptions = stationData.lines as TransitLine[];
	const lineMap = new Map(lineOptions.map((line) => [line.name, line]));
	const allLineNames = lineOptions.map((line) => line.name);
	const settingsKey = 'eodiyeok:settings:v1';
	const historyKey = 'eodiyeok:history:v1';

	let selectedLines = $state([...allLineNames]);
	let includeAirport = $state(true);
	let includeLightRail = $state(true);
	let includeGtx = $state(true);
	let avoidRecent = $state(true);
	let result = $state<Station | null>(null);
	let history = $state<Station[]>([]);
	let settingsOpen = $state(false);
	let historyOpen = $state(false);
	let isDrawing = $state(false);
	let hydrated = $state(false);
	let installPrompt = $state<InstallPromptEvent | null>(null);
	let iosInstallOpen = $state(false);
	let drawRun = 0;

	let enabledCategories = $derived.by(() => {
		const categories: LineCategory[] = ['metro'];
		if (includeAirport) categories.push('airport');
		if (includeLightRail) categories.push('light-rail');
		if (includeGtx) categories.push('gtx');
		return categories;
	});

	let visibleLines = $derived(
		lineOptions.filter((line) => enabledCategories.includes(line.category as LineCategory))
	);
	let activeLineNames = $derived(
		selectedLines.filter((name) => {
			const line = lineMap.get(name);
			return line && enabledCategories.includes(line.category as LineCategory);
		})
	);
	let eligibleStations = $derived(stationsForLines(stations, activeLineNames));
	let primaryLine = $derived(
		result?.lines.find((line) => activeLineNames.includes(line)) ?? result?.lines[0] ?? '1호선'
	);
	let accentColor = $derived(lineMap.get(primaryLine)?.color ?? '#0052A4');

	onMount(() => {
		const storedSettings = localStorage.getItem(settingsKey);
		if (storedSettings) {
			try {
				const parsed = JSON.parse(storedSettings) as Partial<SavedSettings>;
				const validLines = parsed.selectedLines?.filter((line) => lineMap.has(line));
				if (validLines?.length) selectedLines = validLines;
				if (typeof parsed.includeAirport === 'boolean') includeAirport = parsed.includeAirport;
				if (typeof parsed.includeLightRail === 'boolean') {
					includeLightRail = parsed.includeLightRail;
				}
				if (typeof parsed.includeGtx === 'boolean') includeGtx = parsed.includeGtx;
				if (typeof parsed.avoidRecent === 'boolean') avoidRecent = parsed.avoidRecent;
			} catch {
				localStorage.removeItem(settingsKey);
			}
		}

		const storedHistory = localStorage.getItem(historyKey);
		if (storedHistory) {
			try {
				const ids = JSON.parse(storedHistory) as string[];
				history = ids
					.map((id) => stations.find((station) => station.id === id))
					.filter((station): station is Station => Boolean(station))
					.slice(0, 8);
			} catch {
				localStorage.removeItem(historyKey);
			}
		}

		const handleInstallPrompt = (event: Event) => {
			event.preventDefault();
			installPrompt = event as InstallPromptEvent;
		};
		window.addEventListener('beforeinstallprompt', handleInstallPrompt);
		hydrated = true;

		return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
	});

	$effect(() => {
		if (!hydrated) return;
		const settings: SavedSettings = {
			selectedLines,
			includeAirport,
			includeLightRail,
			includeGtx,
			avoidRecent
		};
		localStorage.setItem(settingsKey, JSON.stringify(settings));
		localStorage.setItem(historyKey, JSON.stringify(history.map((station) => station.id)));
	});

	function randomUnit(): number {
		if (globalThis.crypto?.getRandomValues) {
			const value = new Uint32Array(1);
			globalThis.crypto.getRandomValues(value);
			return value[0] / 2 ** 32;
		}
		return Math.random();
	}

	function wait(milliseconds: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, milliseconds));
	}

	async function drawStation() {
		if (isDrawing || eligibleStations.length === 0) return;
		isDrawing = true;
		const currentRun = ++drawRun;
		const recentIds = history.slice(0, 5).map((station) => station.id);

		for (let step = 0; step < 7; step += 1) {
			result = pickRandomStation(eligibleStations, [], false, randomUnit);
			await wait(42 + step * 13);
			if (currentRun !== drawRun) return;
		}

		const finalStation = pickRandomStation(eligibleStations, recentIds, avoidRecent, randomUnit);
		if (finalStation) {
			result = finalStation;
			history = [
				finalStation,
				...history.filter((station) => station.id !== finalStation.id)
			].slice(0, 8);
		}
		isDrawing = false;
	}

	function toggleLine(name: string) {
		selectedLines = selectedLines.includes(name)
			? selectedLines.filter((line) => line !== name)
			: [...selectedLines, name];
	}

	function selectAllVisible() {
		selectedLines = [...new Set([...selectedLines, ...visibleLines.map((line) => line.name)])];
	}

	function clearVisible() {
		const visible = new Set(visibleLines.map((line) => line.name));
		selectedLines = selectedLines.filter((line) => !visible.has(line));
	}

	function resetSettings() {
		selectedLines = [...allLineNames];
		includeAirport = true;
		includeLightRail = true;
		includeGtx = true;
		avoidRecent = true;
	}

	function lineTextColor(lineName: string): string {
		const hex = lineMap.get(lineName)?.color.replace('#', '') ?? '0052A4';
		const [red, green, blue] = [0, 2, 4].map((offset) =>
			Number.parseInt(hex.slice(offset, offset + 2), 16)
		);
		const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
		return luminance > 155 ? '#17202a' : '#ffffff';
	}

	function mapUrl(provider: 'kakao' | 'naver'): string {
		if (!result) return '#';
		const query = encodeURIComponent(`${result.name}역 ${primaryLine}`);
		return provider === 'kakao'
			? `https://map.kakao.com/link/search/${query}`
			: `https://map.naver.com/p/search/${query}`;
	}

	async function installApp() {
		if (installPrompt) {
			await installPrompt.prompt();
			await installPrompt.userChoice;
			installPrompt = null;
			return;
		}
		iosInstallOpen = !iosInstallOpen;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			settingsOpen = false;
			iosInstallOpen = false;
		}
		if (event.key === 'Enter' && !settingsOpen && event.target === document.body) {
			drawStation();
		}
	}
</script>

<svelte:head>
	<title>어디역? — 랜덤 수도권 전철역</title>
	<meta
		name="description"
		content={`수도권 전철역 ${stationData.meta.stationCount}곳 중 오늘 갈 역을 무작위로 골라보세요. 노선 필터와 최근 중복 방지를 지원합니다.`}
	/>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="app-shell" style={`--accent: ${accentColor}; --accent-soft: ${accentColor}1a`}>
	<header class="topbar">
		<a class="brand" href={resolve('/')} aria-label="어디역 홈">
			<span class="brand-mark" aria-hidden="true"><span></span></span>
			<span>어디역?</span>
		</a>
		<div class="top-actions">
			<button class="text-button install-button" type="button" onclick={installApp}>앱 설치</button>
			<button
				class="settings-button"
				type="button"
				onclick={() => (settingsOpen = true)}
				aria-label="추첨 설정 열기"
			>
				<span aria-hidden="true"></span>
				설정
			</button>
		</div>
	</header>

	{#if iosInstallOpen}
		<div class="install-tip" role="status">
			<strong>아이폰·아이패드</strong>
			Safari의 공유 버튼을 누른 뒤 <b>홈 화면에 추가</b>를 선택하세요.
			<button type="button" onclick={() => (iosInstallOpen = false)} aria-label="설치 안내 닫기"
				>×</button
			>
		</div>
	{/if}

	<main>
		<section class="intro" aria-labelledby="page-title">
			<p class="eyebrow">무계획도 좋은 계획이니까</p>
			<h1 id="page-title">오늘은 어디에서<br />내려볼까요?</h1>
			<p class="intro-copy">
				수도권 <strong>{eligibleStations.length}개 역</strong> 중 한 곳을 골라드려요.
			</p>
		</section>

		<section class="ticket-section" aria-live="polite" aria-busy={isDrawing}>
			<div class:rolling={isDrawing} class="ticket">
				<div class="ticket-rail" aria-hidden="true">
					<span class="rail-dot"></span>
					<span class="rail-line"></span>
					<span class="rail-arrow">›</span>
				</div>

				{#if result}
					<div class="ticket-content result-content">
						<p class="ticket-label">오늘의 목적지</p>
						<h2>{result.name}<span>역</span></h2>
						<div class="line-badges" aria-label="정차 노선">
							{#each result.lines as line (line)}
								<span
									class="line-badge"
									style={`--line-color: ${lineMap.get(line)?.color ?? '#405060'}; --line-text: ${lineTextColor(line)}`}
								>
									{line}
								</span>
							{/each}
						</div>
						<p class="operator-copy">{result.operators.join(' · ')}</p>
					</div>
				{:else}
					<div class="ticket-content empty-content">
						<p class="ticket-label">아직 정하지 않았어요</p>
						<h2>어디로<br />가볼까요?</h2>
						<p>버튼을 누르면 새로운 목적지가 나타나요.</p>
					</div>
				{/if}

				<div class="ticket-stamp" aria-hidden="true">
					<span>SEOUL</span>
					<b>01</b>
					<span>METRO</span>
				</div>
			</div>

			<button
				class="draw-button"
				type="button"
				onclick={drawStation}
				disabled={isDrawing || eligibleStations.length === 0}
			>
				<span class="draw-icon" aria-hidden="true">↻</span>
				{isDrawing ? '목적지 찾는 중…' : result ? '다시 뽑기' : '랜덤 역 뽑기'}
			</button>

			{#if result && !isDrawing}
				<div class="map-actions">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={mapUrl('kakao')} target="_blank" rel="noreferrer">카카오맵</a>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={mapUrl('naver')} target="_blank" rel="noreferrer">네이버지도</a>
				</div>
			{/if}
		</section>

		<section class="status-row" aria-label="현재 추첨 조건">
			<button type="button" onclick={() => (settingsOpen = true)}>
				<span class="status-dot"></span>
				{activeLineNames.length}개 노선 선택
				<span aria-hidden="true">수정</span>
			</button>
			<label class="repeat-toggle">
				<input type="checkbox" bind:checked={avoidRecent} />
				<span></span>
				최근 역 피하기
			</label>
		</section>

		{#if history.length > 0}
			<section class="history-section">
				<button
					class="history-heading"
					type="button"
					onclick={() => (historyOpen = !historyOpen)}
					aria-expanded={historyOpen}
				>
					<span>최근 목적지 <b>{history.length}</b></span>
					<span class:open={historyOpen} aria-hidden="true">⌄</span>
				</button>
				{#if historyOpen}
					<ol class="history-list">
						{#each history as station, index (station.id)}
							<li>
								<span class="history-index">{String(index + 1).padStart(2, '0')}</span>
								<button type="button" onclick={() => (result = station)}>{station.name}역</button>
								<span>{station.lines.join(' · ')}</span>
							</li>
						{/each}
					</ol>
				{/if}
			</section>
		{/if}
	</main>

	<footer>
		<p>
			역 정보 {formatSourceDate(stationData.meta.sourceDate)} 기준 ·
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={stationData.meta.sourcePage} target="_blank" rel="noreferrer"
				>철도산업정보센터 공식 자료</a
			>
		</p>
	</footer>
</div>

{#if settingsOpen}
	<button
		class="sheet-backdrop"
		type="button"
		onclick={() => (settingsOpen = false)}
		aria-label="설정 닫기"
	></button>
	<div class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
		<div class="sheet-handle" aria-hidden="true"></div>
		<div class="sheet-header">
			<div>
				<p>추첨 범위</p>
				<h2 id="settings-title">어디까지 가볼까요?</h2>
			</div>
			<button type="button" onclick={() => (settingsOpen = false)} aria-label="설정 닫기">×</button>
		</div>

		<div class="category-options">
			<label>
				<input type="checkbox" checked disabled />
				<span>수도권 전철</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={includeAirport} />
				<span>공항철도</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={includeLightRail} />
				<span>경전철</span>
			</label>
			<label>
				<input type="checkbox" bind:checked={includeGtx} />
				<span>GTX</span>
			</label>
		</div>

		<div class="line-filter-header">
			<h3>노선 선택</h3>
			<div>
				<button type="button" onclick={selectAllVisible}>전체</button>
				<button type="button" onclick={clearVisible}>해제</button>
			</div>
		</div>

		<div class="line-filter-grid">
			{#each visibleLines as line (line.name)}
				<button
					type="button"
					class:active={selectedLines.includes(line.name)}
					onclick={() => toggleLine(line.name)}
					aria-pressed={selectedLines.includes(line.name)}
					style={`--line-color: ${line.color}`}
				>
					<span></span>
					{line.name}
				</button>
			{/each}
		</div>

		<div class="sheet-summary">
			<span><b>{eligibleStations.length}</b>개 역이 후보예요</span>
			<button type="button" onclick={resetSettings}>기본값 복원</button>
		</div>
		<button
			class="sheet-confirm"
			type="button"
			onclick={() => (settingsOpen = false)}
			disabled={eligibleStations.length === 0}
		>
			이대로 뽑기
		</button>
	</div>
{/if}

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		background: #eef2f5;
		color: #101820;
		font-family:
			'Pretendard Variable',
			Pretendard,
			-apple-system,
			BlinkMacSystemFont,
			system-ui,
			sans-serif;
		font-synthesis: none;
	}

	:global(body) {
		margin: 0;
		min-width: 320px;
		min-height: 100vh;
		background:
			linear-gradient(90deg, transparent 0 49.8%, rgba(19, 38, 54, 0.035) 50%, transparent 50.2%),
			#eef2f5;
	}

	:global(button),
	:global(a) {
		font: inherit;
	}

	:global(button) {
		-webkit-tap-highlight-color: transparent;
	}

	.app-shell {
		width: min(100%, 1100px);
		min-height: 100vh;
		margin: 0 auto;
		padding: 0 24px;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 84px;
		border-bottom: 1px solid rgba(16, 24, 32, 0.12);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 11px;
		color: #101820;
		font-size: 21px;
		font-weight: 800;
		text-decoration: none;
		letter-spacing: 0;
	}

	.brand-mark {
		display: grid;
		width: 28px;
		height: 28px;
		place-items: center;
		border: 7px solid #101820;
		border-radius: 50%;
	}

	.brand-mark span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
	}

	.top-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.text-button,
	.settings-button {
		min-height: 42px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: #3d4953;
		font-size: 14px;
		font-weight: 650;
		cursor: pointer;
	}

	.text-button {
		padding: 0 10px;
	}

	.settings-button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		border: 1px solid rgba(16, 24, 32, 0.18);
		background: rgba(255, 255, 255, 0.64);
	}

	.settings-button span {
		position: relative;
		width: 14px;
		height: 10px;
		border-top: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
	}

	.settings-button span::after {
		position: absolute;
		top: 3px;
		left: 0;
		width: 14px;
		border-top: 2px solid currentColor;
		content: '';
	}

	.install-tip {
		position: relative;
		width: min(100%, 540px);
		margin: 14px auto -4px;
		padding: 13px 44px 13px 16px;
		border: 1px solid #c8d1d8;
		border-radius: 6px;
		background: #fff;
		color: #48545e;
		font-size: 13px;
		line-height: 1.55;
	}

	.install-tip strong {
		display: block;
		color: #101820;
	}

	.install-tip button {
		position: absolute;
		top: 8px;
		right: 9px;
		border: 0;
		background: transparent;
		font-size: 22px;
		cursor: pointer;
	}

	main {
		display: grid;
		grid-template-columns: minmax(260px, 0.76fr) minmax(410px, 1.24fr);
		gap: 62px;
		align-items: center;
		padding: 76px 30px 40px;
	}

	.intro {
		align-self: start;
		padding-top: 30px;
	}

	.eyebrow,
	.ticket-label,
	.sheet-header p {
		margin: 0;
		color: var(--accent);
		font-size: 13px;
		font-weight: 800;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.intro h1 {
		margin: 17px 0 20px;
		font-size: clamp(44px, 5.4vw, 72px);
		font-weight: 800;
		line-height: 1.06;
		letter-spacing: -0.055em;
	}

	.intro-copy {
		margin: 0;
		color: #5d6973;
		font-size: 16px;
		line-height: 1.65;
	}

	.intro-copy strong {
		color: #101820;
	}

	.ticket-section {
		width: 100%;
	}

	.ticket {
		position: relative;
		min-height: 358px;
		overflow: hidden;
		border: 1px solid rgba(16, 24, 32, 0.18);
		border-top: 8px solid var(--accent);
		border-radius: 8px;
		background: #fff;
		box-shadow: 0 22px 60px rgba(26, 42, 54, 0.11);
		transition:
			border-color 180ms ease,
			transform 180ms ease;
	}

	.ticket::before,
	.ticket::after {
		position: absolute;
		top: 74%;
		width: 28px;
		height: 28px;
		border: 1px solid rgba(16, 24, 32, 0.16);
		border-radius: 50%;
		background: #eef2f5;
		content: '';
		transform: translateY(-50%);
	}

	.ticket::before {
		left: -15px;
	}

	.ticket::after {
		right: -15px;
	}

	.ticket.rolling {
		transform: translateY(2px);
	}

	.ticket-rail {
		display: flex;
		align-items: center;
		height: 54px;
		padding: 0 30px;
		background: var(--accent-soft);
	}

	.rail-dot {
		width: 14px;
		height: 14px;
		border: 4px solid var(--accent);
		border-radius: 50%;
		background: #fff;
	}

	.rail-line {
		flex: 1;
		border-top: 2px solid var(--accent);
	}

	.rail-arrow {
		margin-left: -2px;
		color: var(--accent);
		font-size: 27px;
		line-height: 0;
	}

	.ticket-content {
		min-height: 238px;
		padding: 38px 42px 28px;
	}

	.ticket-content h2 {
		margin: 12px 0 17px;
		font-size: clamp(49px, 7vw, 78px);
		font-weight: 850;
		line-height: 1;
		letter-spacing: -0.055em;
	}

	.ticket-content h2 span {
		margin-left: 5px;
		font-size: 0.4em;
		font-weight: 700;
		letter-spacing: 0;
	}

	.empty-content h2 {
		font-size: clamp(44px, 6vw, 64px);
		line-height: 1.06;
	}

	.empty-content > p:last-child,
	.operator-copy {
		margin: 16px 0 0;
		color: #7a858d;
		font-size: 12px;
		line-height: 1.5;
	}

	.line-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.line-badge {
		padding: 6px 10px;
		border-radius: 4px;
		background: var(--line-color);
		color: var(--line-text);
		font-size: 12px;
		font-weight: 750;
	}

	.ticket-stamp {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 58px;
		margin: 0 30px;
		border-top: 1px dashed rgba(16, 24, 32, 0.2);
		color: #9aa3a9;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 10px;
		letter-spacing: 0.13em;
	}

	.ticket-stamp b {
		font-size: 22px;
		font-weight: 500;
	}

	.draw-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 62px;
		margin-top: 16px;
		border: 0;
		border-radius: 7px;
		background: #101820;
		color: #fff;
		font-size: 17px;
		font-weight: 750;
		cursor: pointer;
		transition:
			transform 120ms ease,
			background 160ms ease;
	}

	.draw-button:hover:not(:disabled) {
		background: var(--accent);
	}

	.draw-button:active:not(:disabled) {
		transform: translateY(2px);
	}

	.draw-button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.draw-icon {
		margin-right: 9px;
		font-size: 25px;
		font-weight: 400;
	}

	.rolling + .draw-button .draw-icon {
		animation: spin 650ms linear infinite;
	}

	.map-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 8px;
	}

	.map-actions a {
		display: grid;
		height: 48px;
		place-items: center;
		border: 1px solid rgba(16, 24, 32, 0.16);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.64);
		color: #26323b;
		font-size: 13px;
		font-weight: 700;
		text-decoration: none;
	}

	.status-row {
		grid-column: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: -38px;
		padding: 15px 2px 0;
	}

	.status-row > button {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 8px 0;
		border: 0;
		background: transparent;
		color: #4e5b64;
		font-size: 12px;
		font-weight: 650;
		cursor: pointer;
	}

	.status-row > button span:last-child {
		margin-left: 3px;
		color: #8a949b;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}

	.repeat-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #4e5b64;
		font-size: 12px;
		font-weight: 650;
		cursor: pointer;
	}

	.repeat-toggle input {
		position: absolute;
		opacity: 0;
	}

	.repeat-toggle span {
		position: relative;
		width: 34px;
		height: 20px;
		border-radius: 10px;
		background: #b8c0c6;
		transition: background 160ms ease;
	}

	.repeat-toggle span::after {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #fff;
		content: '';
		transition: transform 160ms ease;
	}

	.repeat-toggle input:checked + span {
		background: var(--accent);
	}

	.repeat-toggle input:checked + span::after {
		transform: translateX(14px);
	}

	.history-section {
		grid-column: 1 / -1;
		margin-top: 4px;
		border-top: 1px solid rgba(16, 24, 32, 0.12);
	}

	.history-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 18px 0;
		border: 0;
		background: transparent;
		color: #34414a;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}

	.history-heading b {
		margin-left: 5px;
		color: var(--accent);
	}

	.history-heading > span:last-child {
		font-size: 20px;
		transition: transform 160ms ease;
	}

	.history-heading > span:last-child.open {
		transform: rotate(180deg);
	}

	.history-list {
		margin: -2px 0 0;
		padding: 0 0 12px;
		list-style: none;
	}

	.history-list li {
		display: grid;
		grid-template-columns: 34px minmax(100px, 1fr) 2fr;
		align-items: center;
		padding: 11px 0;
		border-top: 1px solid rgba(16, 24, 32, 0.07);
		color: #7b858c;
		font-size: 12px;
	}

	.history-index {
		font-family: ui-monospace, monospace;
	}

	.history-list button {
		justify-self: start;
		padding: 2px 0;
		border: 0;
		background: transparent;
		color: #19242c;
		font-weight: 750;
		cursor: pointer;
	}

	footer {
		padding: 4px 30px 32px;
		color: #8b959d;
		font-size: 11px;
		text-align: right;
	}

	footer p {
		margin: 0;
	}

	footer a {
		color: inherit;
		text-underline-offset: 3px;
	}

	.sheet-backdrop {
		position: fixed;
		z-index: 20;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: rgba(9, 16, 22, 0.52);
		cursor: default;
		backdrop-filter: blur(3px);
	}

	.settings-sheet {
		position: fixed;
		z-index: 21;
		top: 0;
		right: 0;
		width: min(460px, 100%);
		height: 100dvh;
		overflow-y: auto;
		padding: 30px 34px 32px;
		background: #f8fafb;
		box-shadow: -20px 0 60px rgba(0, 0, 0, 0.18);
		animation: slide-in 210ms ease-out;
	}

	.sheet-handle {
		display: none;
	}

	.sheet-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding-bottom: 24px;
		border-bottom: 1px solid rgba(16, 24, 32, 0.12);
	}

	.sheet-header h2 {
		margin: 7px 0 0;
		font-size: 26px;
		letter-spacing: -0.04em;
	}

	.sheet-header > button {
		width: 38px;
		height: 38px;
		border: 1px solid #d4dade;
		border-radius: 50%;
		background: transparent;
		font-size: 24px;
		cursor: pointer;
	}

	.category-options {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: 24px 0 28px;
	}

	.category-options label {
		position: relative;
		cursor: pointer;
	}

	.category-options input {
		position: absolute;
		opacity: 0;
	}

	.category-options span {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 46px;
		padding: 0 14px;
		border: 1px solid #d5dce1;
		border-radius: 6px;
		background: #fff;
		color: #52606a;
		font-size: 13px;
		font-weight: 650;
	}

	.category-options span::after {
		width: 16px;
		height: 16px;
		border: 1px solid #abb5bd;
		border-radius: 3px;
		content: '';
	}

	.category-options input:checked + span {
		border-color: #101820;
		color: #101820;
	}

	.category-options input:checked + span::after {
		border-color: #101820;
		background:
			linear-gradient(135deg, transparent 44%, white 45% 55%, transparent 56%) center / 8px 8px,
			#101820;
	}

	.category-options input:disabled + span {
		cursor: default;
	}

	.line-filter-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 13px;
	}

	.line-filter-header h3 {
		margin: 0;
		font-size: 14px;
	}

	.line-filter-header div {
		display: flex;
		gap: 6px;
	}

	.line-filter-header button,
	.sheet-summary button {
		padding: 4px 7px;
		border: 0;
		background: transparent;
		color: #6d7880;
		font-size: 11px;
		font-weight: 650;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.line-filter-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 7px;
	}

	.line-filter-grid button {
		display: flex;
		align-items: center;
		gap: 9px;
		height: 42px;
		padding: 0 11px;
		border: 1px solid #d8dee3;
		border-radius: 5px;
		background: #fff;
		color: #7a858d;
		font-size: 12px;
		font-weight: 650;
		text-align: left;
		cursor: pointer;
	}

	.line-filter-grid button span {
		width: 10px;
		height: 10px;
		border: 3px solid #c3cbd1;
		border-radius: 50%;
		background: transparent;
	}

	.line-filter-grid button.active {
		border-color: #adb6bd;
		color: #1d2931;
	}

	.line-filter-grid button.active span {
		border-color: var(--line-color);
		background: var(--line-color);
		box-shadow: inset 0 0 0 2px white;
	}

	.sheet-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 22px;
		padding-top: 18px;
		border-top: 1px solid #d9dfe3;
		color: #59656e;
		font-size: 12px;
	}

	.sheet-summary b {
		color: #101820;
		font-size: 18px;
	}

	.sheet-confirm {
		width: 100%;
		height: 54px;
		margin-top: 16px;
		border: 0;
		border-radius: 6px;
		background: #101820;
		color: #fff;
		font-size: 15px;
		font-weight: 750;
		cursor: pointer;
	}

	.sheet-confirm:disabled {
		opacity: 0.45;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	@media (max-width: 780px) {
		.app-shell {
			padding: 0 18px;
		}

		.topbar {
			height: 68px;
		}

		.brand {
			font-size: 19px;
		}

		.install-button {
			display: none;
		}

		main {
			display: block;
			padding: 42px 0 28px;
		}

		.intro {
			padding: 0 4px 30px;
		}

		.intro h1 {
			margin-top: 13px;
			font-size: clamp(42px, 13.2vw, 60px);
		}

		.ticket {
			min-height: 336px;
		}

		.ticket-content {
			min-height: 218px;
			padding: 32px 28px 23px;
		}

		.ticket-content h2 {
			font-size: clamp(50px, 16vw, 72px);
		}

		.empty-content h2 {
			font-size: 48px;
		}

		.ticket-rail {
			padding: 0 24px;
		}

		.ticket-stamp {
			margin: 0 23px;
		}

		.status-row {
			margin: 0;
			padding: 15px 2px 0;
		}

		.history-section {
			margin-top: 26px;
		}

		.history-list li {
			grid-template-columns: 30px minmax(88px, 0.8fr) 1.6fr;
		}

		footer {
			padding: 0 2px 26px;
			text-align: left;
		}

		.settings-sheet {
			top: auto;
			bottom: 0;
			width: 100%;
			height: min(88dvh, 760px);
			padding: 13px 20px 28px;
			border-radius: 12px 12px 0 0;
			animation: sheet-up 210ms ease-out;
		}

		.sheet-handle {
			display: block;
			width: 42px;
			height: 4px;
			margin: 0 auto 18px;
			border-radius: 2px;
			background: #c4ccd1;
		}
	}

	@media (max-width: 390px) {
		.app-shell {
			padding: 0 14px;
		}

		.settings-button {
			padding: 0 11px;
		}

		.intro h1 {
			font-size: 43px;
		}

		.status-row {
			align-items: flex-start;
			gap: 8px;
		}

		.repeat-toggle {
			padding-top: 7px;
		}
	}

	@keyframes sheet-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		*,
		*::before,
		*::after {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
