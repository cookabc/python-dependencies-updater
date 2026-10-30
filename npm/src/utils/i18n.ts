/**
 * Internationalization support for NPM Dependencies Updater
 */

import * as vscode from "vscode";

interface Messages {
	updateTo: string;
	upToDate: string;
	checking: string;
	checkingDeps: string;
	scanning: string;
	updatesAvailable: string;
	includesMajor: string;
	clickToUpdate: string;
	updatesTooltip: string;
	retryCheck: string;
	npmDeps: string;
	checkFailed: string;
	majorUpdate: string;
	minorUpdate: string;
	patchUpdate: string;
	packageNotFound: string;
	connectionFailed: string;
	openPackageJson: string;
	allUpToDate: string;
	majorWarning: string;
	updateAnyway: string;
	packageUpToDate: string;
	updatedCount: string;
	majorFound: string;
	updateSafeOnly: string;
	updateAllRisky: string;
	latest: string;
}

const messages: Record<string, Messages> = {
	en: {
		updateTo: "Update to",
		upToDate: "Up to date",
		checking: "Checking",
		checkingDeps: "Checking dependencies...",
		scanning: "Scanning for updates...",
		updatesAvailable: "updates available",
		includesMajor: " (Includes major updates)",
		clickToUpdate: "Click to update",
		updatesTooltip: "{0} packages with updates",
		retryCheck: "Click to retry",
		npmDeps: "NPM Dependencies",
		checkFailed: "Check failed",
		majorUpdate: "Major Update",
		minorUpdate: "Minor Update",
		patchUpdate: "Patch Update",
		packageNotFound: "Package not found",
		connectionFailed: "Connection failed",
		openPackageJson: "Please open a package.json file",
		allUpToDate: "All dependencies are up to date",
		majorWarning: "is a major update. Continue?",
		updateAnyway: "Update Anyway",
		packageUpToDate: "is up to date",
		updatedCount: "Updated {0} packages.",
		majorFound:
			"Found {0} major version update(s) that may include breaking changes:",
		updateSafeOnly: "Update Safe Only",
		updateAllRisky: "Update All (Including Risky)",
		latest: "Latest",
	},
	"zh-cn": {
		updateTo: "更新到",
		upToDate: "已是最新",
		checking: "检查中",
		checkingDeps: "正在检查依赖...",
		scanning: "正在扫描更新...",
		updatesAvailable: "个可用的更新",
		includesMajor: " (包含重大更新)",
		clickToUpdate: "点击更新",
		updatesTooltip: "{0} 个包有更新",
		retryCheck: "点击重试",
		npmDeps: "NPM 依赖项",
		checkFailed: "检查失败",
		majorUpdate: "重大更新",
		minorUpdate: "次要更新",
		patchUpdate: "补丁更新",
		packageNotFound: "未找到包",
		connectionFailed: "连接失败",
		openPackageJson: "请打开 package.json 文件",
		allUpToDate: "所有依赖项均已是最新",
		majorWarning: "是一个重大更新。是否继续？",
		updateAnyway: "仍然更新",
		packageUpToDate: "已是最新",
		updatedCount: "已更新 {0} 个包。",
		majorFound: "发现 {0} 个重大版本更新，可能包含破坏性变更：",
		updateSafeOnly: "仅更新安全版本",
		updateAllRisky: "全部更新 (包含风险)",
		latest: "最新版本",
	},
	"zh-tw": {
		updateTo: "更新到",
		upToDate: "已是最新",
		checking: "檢查中",
		checkingDeps: "正在檢查依賴...",
		scanning: "正在掃描更新...",
		updatesAvailable: "個可用的更新",
		includesMajor: " (包含重大更新)",
		clickToUpdate: "點擊更新",
		updatesTooltip: "{0} 個套件有更新",
		retryCheck: "點擊重試",
		npmDeps: "NPM 依賴項",
		checkFailed: "檢查失敗",
		majorUpdate: "重大更新",
		minorUpdate: "次要更新",
		patchUpdate: "修補更新",
		packageNotFound: "未找到套件",
		connectionFailed: "連線失敗",
		openPackageJson: "請開啟 package.json 檔案",
		allUpToDate: "所有依賴項均已是最新",
		majorWarning: "是一個重大更新。是否繼續？",
		updateAnyway: "仍然更新",
		packageUpToDate: "已是最新",
		updatedCount: "已更新 {0} 個套件。",
		majorFound: "發現 {0} 個重大版本更新，可能包含破壞性變更：",
		updateSafeOnly: "僅更新安全版本",
		updateAllRisky: "全部更新 (包含風險)",
		latest: "最新版本",
	},
	ja: {
		updateTo: "更新先",
		upToDate: "最新",
		checking: "確認中",
		checkingDeps: "依存関係を確認中...",
		scanning: "更新をスキャン中...",
		updatesAvailable: "件の更新があります",
		includesMajor: " (メジャー更新を含む)",
		clickToUpdate: "クリックして更新",
		updatesTooltip: "{0} パッケージに更新があります",
		retryCheck: "クリックして再試行",
		npmDeps: "NPM 依存関係",
		checkFailed: "確認失敗",
		majorUpdate: "メジャー更新",
		minorUpdate: "マイナー更新",
		patchUpdate: "パッチ更新",
		packageNotFound: "パッケージが見つかりません",
		connectionFailed: "接続失敗",
		openPackageJson: "package.json ファイルを開いてください",
		allUpToDate: "すべての依存関係は最新です",
		majorWarning: "はメジャー更新です。続行しますか？",
		updateAnyway: "それでも更新",
		packageUpToDate: "は最新です",
		updatedCount: "{0} 個のパッケージを更新しました。",
		majorFound:
			"{0} 件のメジャーバージョン更新が見つかりました。破壊的変更が含まれる可能性があります：",
		updateSafeOnly: "安全な更新のみ",
		updateAllRisky: "すべて更新 (リスクあり)",
		latest: "最新",
	},
	ko: {
		updateTo: "업데이트",
		upToDate: "최신 상태",
		checking: "확인 중",
		checkingDeps: "의존성 확인 중...",
		scanning: "업데이트 스캔 중...",
		updatesAvailable: "개 업데이트 가능",
		includesMajor: " (주요 업데이트 포함)",
		clickToUpdate: "클릭하여 업데이트",
		updatesTooltip: "{0}개 패키지에 업데이트 있음",
		retryCheck: "클릭하여 재시도",
		npmDeps: "NPM 의존성",
		checkFailed: "확인 실패",
		majorUpdate: "주요 업데이트",
		minorUpdate: "부분 업데이트",
		patchUpdate: "패치 업데이트",
		packageNotFound: "패키지를 찾을 수 없음",
		connectionFailed: "연결 실패",
		openPackageJson: "package.json 파일을 열어주세요",
		allUpToDate: "모든 의존성이 최신 상태입니다",
		majorWarning: "은(는) 주요 업데이트입니다. 계속하시겠습니까?",
		updateAnyway: "그래도 업데이트",
		packageUpToDate: "은(는) 최신 상태입니다",
		updatedCount: "{0}개 패키지를 업데이트했습니다.",
		majorFound:
			"{0}개의 주요 버전 업데이트가 발견되었습니다. 호환성을 깨뜨리는 변경이 포함될 수 있습니다:",
		updateSafeOnly: "안전한 업데이트만",
		updateAllRisky: "전체 업데이트 (위험 포함)",
		latest: "최신",
	},
	fr: {
		updateTo: "Mettre à jour vers",
		upToDate: "À jour",
		checking: "Vérification",
		checkingDeps: "Vérification des dépendances...",
		scanning: "Recherche de mises à jour...",
		updatesAvailable: "mises à jour disponibles",
		includesMajor: " (Inclut des mises à jour majeures)",
		clickToUpdate: "Cliquer pour mettre à jour",
		updatesTooltip: "{0} paquets avec des mises à jour",
		retryCheck: "Cliquez pour réessayer",
		npmDeps: "Dépendances NPM",
		checkFailed: "Échec de la vérification",
		majorUpdate: "Mise à jour majeure",
		minorUpdate: "Mise à jour mineure",
		patchUpdate: "Mise à jour corrective",
		packageNotFound: "Paquet introuvable",
		connectionFailed: "Échec de la connexion",
		openPackageJson: "Veuillez ouvrir un fichier package.json",
		allUpToDate: "Toutes les dépendances sont à jour",
		majorWarning: "est une mise à jour majeure. Continuer ?",
		updateAnyway: "Mettre à jour quand même",
		packageUpToDate: "est à jour",
		updatedCount: "{0} paquets mis à jour.",
		majorFound:
			"{0} mise(s) à jour majeure(s) trouvée(s) pouvant inclure des changements incompatibles :",
		updateSafeOnly: "Mises à jour sûres uniquement",
		updateAllRisky: "Tout mettre à jour (risqué)",
		latest: "Dernière version",
	},
	de: {
		updateTo: "Aktualisieren auf",
		upToDate: "Aktuell",
		checking: "Prüfung",
		checkingDeps: "Abhängigkeiten werden geprüft...",
		scanning: "Suche nach Updates...",
		updatesAvailable: "Updates verfügbar",
		includesMajor: " (Enthält Hauptversions-Updates)",
		clickToUpdate: "Klicken zum Aktualisieren",
		updatesTooltip: "{0} Pakete mit Updates",
		retryCheck: "Klicken zum Wiederholen",
		npmDeps: "NPM-Abhängigkeiten",
		checkFailed: "Prüfung fehlgeschlagen",
		majorUpdate: "Hauptversions-Update",
		minorUpdate: "Nebenversions-Update",
		patchUpdate: "Patch-Update",
		packageNotFound: "Paket nicht gefunden",
		connectionFailed: "Verbindung fehlgeschlagen",
		openPackageJson: "Bitte öffnen Sie eine package.json-Datei",
		allUpToDate: "Alle Abhängigkeiten sind aktuell",
		majorWarning: "ist ein Hauptversions-Update. Fortfahren?",
		updateAnyway: "Trotzdem aktualisieren",
		packageUpToDate: "ist aktuell",
		updatedCount: "{0} Pakete aktualisiert.",
		majorFound:
			"{0} Hauptversions-Update(s) gefunden, die inkompatible Änderungen enthalten können:",
		updateSafeOnly: "Nur sichere Updates",
		updateAllRisky: "Alle aktualisieren (riskant)",
		latest: "Neueste",
	},
	it: {
		updateTo: "Aggiorna a",
		upToDate: "Aggiornato",
		checking: "Verifica",
		checkingDeps: "Verifica delle dipendenze...",
		scanning: "Scansione aggiornamenti...",
		updatesAvailable: "aggiornamenti disponibili",
		includesMajor: " (Include aggiornamenti importanti)",
		clickToUpdate: "Clicca per aggiornare",
		updatesTooltip: "{0} pacchetti con aggiornamenti",
		retryCheck: "Clicca per riprovare",
		npmDeps: "Dipendenze NPM",
		checkFailed: "Verifica fallita",
		majorUpdate: "Aggiornamento importante",
		minorUpdate: "Aggiornamento secondario",
		patchUpdate: "Aggiornamento patch",
		packageNotFound: "Pacchetto non trovato",
		connectionFailed: "Connessione fallita",
		openPackageJson: "Si prega di aprire un file package.json",
		allUpToDate: "Tutte le dipendenze sono aggiornate",
		majorWarning: "è un aggiornamento importante. Continuare?",
		updateAnyway: "Aggiorna comunque",
		packageUpToDate: "è aggiornato",
		updatedCount: "{0} pacchetti aggiornati.",
		majorFound:
			"Trovati {0} aggiornamenti di versione importante che possono includere modifiche incompatibili:",
		updateSafeOnly: "Solo aggiornamenti sicuri",
		updateAllRisky: "Aggiorna tutto (rischioso)",
		latest: "Ultima versione",
	},
	es: {
		updateTo: "Actualizar a",
		upToDate: "Actualizado",
		checking: "Verificando",
		checkingDeps: "Verificando dependencias...",
		scanning: "Buscando actualizaciones...",
		updatesAvailable: "actualizaciones disponibles",
		includesMajor: " (Incluye actualizaciones importantes)",
		clickToUpdate: "Clic para actualizar",
		updatesTooltip: "{0} paquetes con actualizaciones",
		retryCheck: "Haga clic para reintentar",
		npmDeps: "Dependencias NPM",
		checkFailed: "Verificación fallida",
		majorUpdate: "Actualización importante",
		minorUpdate: "Actualización menor",
		patchUpdate: "Actualización de parche",
		packageNotFound: "Paquete no encontrado",
		connectionFailed: "Conexión fallida",
		openPackageJson: "Por favor, abra un archivo package.json",
		allUpToDate: "Todas las dependencias están actualizadas",
		majorWarning: "es una actualización importante. ¿Continuar?",
		updateAnyway: "Actualizar de todos modos",
		packageUpToDate: "está actualizado",
		updatedCount: "{0} paquetes actualizados.",
		majorFound:
			"Se encontraron {0} actualizaciones de versión importante que pueden incluir cambios incompatibles:",
		updateSafeOnly: "Solo actualizaciones seguras",
		updateAllRisky: "Actualizar todo (riesgoso)",
		latest: "Última versión",
	},
	ru: {
		updateTo: "Обновить до",
		upToDate: "Актуально",
		checking: "Проверка",
		checkingDeps: "Проверка зависимостей...",
		scanning: "Поиск обновлений...",
		updatesAvailable: "обновлений доступно",
		includesMajor: " (Включает мажорные обновления)",
		clickToUpdate: "Нажмите для обновления",
		updatesTooltip: "{0} пакетов с обновлениями",
		retryCheck: "Нажмите для повтора",
		npmDeps: "Зависимости NPM",
		checkFailed: "Ошибка проверки",
		majorUpdate: "Мажорное обновление",
		minorUpdate: "Минорное обновление",
		patchUpdate: "Патч-обновление",
		packageNotFound: "Пакет не найден",
		connectionFailed: "Ошибка подключения",
		openPackageJson: "Пожалуйста, откройте файл package.json",
		allUpToDate: "Все зависимости актуальны",
		majorWarning: "— мажорное обновление. Продолжить?",
		updateAnyway: "Всё равно обновить",
		packageUpToDate: "актуально",
		updatedCount: "Обновлено {0} пакетов.",
		majorFound:
			"Найдено {0} мажорных обновлений, которые могут содержать несовместимые изменения:",
		updateSafeOnly: "Только безопасные обновления",
		updateAllRisky: "Обновить все (рискованно)",
		latest: "Последняя версия",
	},
};

function getLocale(): string {
	const locale = vscode.env.language.toLowerCase();
	if (messages[locale]) {
		return locale;
	}
	const language = locale.split("-")[0];
	if (language === "zh") {
		return locale.includes("tw") || locale.includes("hk") ? "zh-tw" : "zh-cn";
	}
	if (messages[language]) {
		return language;
	}
	return "en";
}

export function t(key: keyof Messages, ...args: (string | number)[]): string {
	const locale = getLocale();
	let msg = messages[locale]?.[key] || messages["en"][key];
	if (args.length > 0) {
		args.forEach((arg, i) => {
			msg = msg.replace(`{${i}}`, String(arg));
		});
	}
	return msg;
}
