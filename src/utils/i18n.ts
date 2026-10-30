/**
 * Internationalization support
 */

import * as vscode from "vscode";

interface Messages {
	updateTo: string;
	upToDate: string;
	latest: string;
	updateAll: string;
	updated: string;
	packages: string;
	noUpdates: string;
	openRequirements: string;
	checkFailed: string;
	checking: string;
	updateAnyway: string;
	updateSafeOnly: string;
	updateAllRisky: string;
	majorFound: string;
	statusBarUpToDate: string;
	statusBarUpdatesAvailable: string;
	statusBarTooltipUpToDate: string;
	statusBarTooltipUpdates: string;
	noCompatible: string;
	majorUpdateDetected: string;
	continueQuestion: string;
	majorSkipped: string;
	vulnerable: string;
	vulnerableTooltip: string;
	statusBarVulnerable: string;
}

const messages: Record<string, Messages> = {
	en: {
		vulnerable: "{0} known vulnerability(ies)",
		vulnerableTooltip:
			"Known vulnerabilities in {0} {1}. Click to open the report.",
		statusBarVulnerable: "{0} vulnerable",
		updateTo: "Update to",
		upToDate: "Up to date",
		latest: "latest",
		updateAll: "Update All Packages to Latest Versions",
		updated: "Updated",
		packages: "packages to latest versions",
		noUpdates: "No packages to update",
		openRequirements: "Please open a requirements.txt or pyproject.toml file",
		checkFailed: "Check failed",
		checking: "Checking",
		updateAnyway: "Update Anyway",
		noCompatible: "No compatible update",
		majorUpdateDetected: "Major version update detected!",
		continueQuestion: "This may include breaking changes. Continue?",
		majorSkipped: "({0} major updates skipped)",
		updateSafeOnly: "Update Safe Only",
		updateAllRisky: "Update All (Including Risky)",
		majorFound:
			"Found {0} major version update(s) that may include breaking changes:",
		statusBarUpToDate: "{0} packages up to date",
		statusBarUpdatesAvailable: "{0} updates available",
		statusBarTooltipUpToDate: "All packages are up to date",
		statusBarTooltipUpdates:
			"{0} of {1} packages have updates available. Click to update all.",
	},
	"zh-cn": {
		vulnerable: "{0} 个已知漏洞",
		vulnerableTooltip: "{0} {1} 存在已知漏洞，点击查看报告。",
		statusBarVulnerable: "{0} 个有漏洞",
		updateTo: "更新到",
		upToDate: "已是最新",
		latest: "最新",
		updateAll: "更新所有包到最新版本",
		updated: "已更新",
		packages: "个包到最新版本",
		noUpdates: "没有需要更新的包",
		openRequirements: "请打开 requirements.txt 或 pyproject.toml 文件",
		checkFailed: "检查失败",
		checking: "检查中",
		updateAnyway: "仍然更新",
		noCompatible: "没有兼容的新版本",
		majorUpdateDetected: "检测到主版本更新！",
		continueQuestion: "可能包含破坏性变更，是否继续？",
		majorSkipped: "（已跳过 {0} 个主版本更新）",
		updateSafeOnly: "仅更新安全版本",
		updateAllRisky: "全部更新 (包含风险)",
		majorFound: "发现 {0} 个重大版本更新，可能包含破坏性变更：",
		statusBarUpToDate: "{0} 个包已是最新",
		statusBarUpdatesAvailable: "{0} 个更新可用",
		statusBarTooltipUpToDate: "所有包都已是最新",
		statusBarTooltipUpdates: "{1} 个包中有 {0} 个有更新可用。点击全部更新。",
	},
	"zh-tw": {
		vulnerable: "{0} 個已知漏洞",
		vulnerableTooltip: "{0} {1} 存在已知漏洞，點擊查看報告。",
		statusBarVulnerable: "{0} 個有漏洞",
		updateTo: "更新到",
		upToDate: "已是最新",
		latest: "最新",
		updateAll: "更新所有套件到最新版本",
		updated: "已更新",
		packages: "個套件到最新版本",
		noUpdates: "沒有需要更新的套件",
		openRequirements: "請開啟 requirements.txt 或 pyproject.toml 檔案",
		checkFailed: "檢查失敗",
		checking: "檢查中",
		updateAnyway: "仍然更新",
		noCompatible: "沒有相容的新版本",
		majorUpdateDetected: "偵測到主版本更新！",
		continueQuestion: "可能包含破壞性變更，是否繼續？",
		majorSkipped: "（已略過 {0} 個主版本更新）",
		updateSafeOnly: "僅更新安全版本",
		updateAllRisky: "全部更新 (包含風險)",
		majorFound: "發現 {0} 個重大版本更新，可能包含破壞性變更：",
		statusBarUpToDate: "{0} 個套件已是最新",
		statusBarUpdatesAvailable: "{0} 個更新可用",
		statusBarTooltipUpToDate: "所有套件都已是最新",
		statusBarTooltipUpdates: "{1} 個套件中有 {0} 個有更新可用。點擊全部更新。",
	},
	ja: {
		vulnerable: "既知の脆弱性 {0} 件",
		vulnerableTooltip:
			"{0} {1} に既知の脆弱性があります。クリックでレポートを開きます。",
		statusBarVulnerable: "脆弱性 {0} 件",
		updateTo: "アップデート",
		upToDate: "最新です",
		latest: "最新",
		updateAll: "すべてのパッケージを最新版に更新",
		updated: "更新しました",
		packages: "パッケージを最新版に更新",
		noUpdates: "更新するパッケージはありません",
		openRequirements:
			"requirements.txt または pyproject.toml ファイルを開いてください",
		checkFailed: "チェック失敗",
		checking: "チェック中",
		updateAnyway: "とにかく更新",
		noCompatible: "互換性のある更新はありません",
		majorUpdateDetected: "メジャーアップデートを検出しました！",
		continueQuestion: "破壊的な変更が含まれる可能性があります。続行しますか？",
		majorSkipped: "（{0} 件のメジャーアップデートをスキップしました）",
		updateSafeOnly: "安全な更新のみ",
		updateAllRisky: "すべて更新 (リスクあり)",
		majorFound:
			"{0} 個のメジャーアップデートが見つかりました。破壊的な変更が含まれている可能性があります：",
		statusBarUpToDate: "{0} パッケージは最新です",
		statusBarUpdatesAvailable: "{0} 件の更新があります",
		statusBarTooltipUpToDate: "すべてのパッケージが最新です",
		statusBarTooltipUpdates:
			"{1} パッケージ中 {0} 件の更新があります。クリックして全て更新。",
	},
	ko: {
		vulnerable: "알려진 취약점 {0}개",
		vulnerableTooltip:
			"{0} {1}에 알려진 취약점이 있습니다. 클릭하면 보고서를 엽니다.",
		statusBarVulnerable: "취약점 {0}개",
		updateTo: "업데이트",
		upToDate: "최신 버전",
		latest: "최신",
		updateAll: "모든 패키지를 최신 버전으로 업데이트",
		updated: "업데이트됨",
		packages: "패키지를 최신 버전으로 업데이트",
		noUpdates: "업데이트할 패키지가 없습니다",
		openRequirements: "requirements.txt 또는 pyproject.toml 파일을 열어주세요",
		checkFailed: "확인 실패",
		checking: "확인 중",
		updateAnyway: "그래도 업데이트",
		noCompatible: "호환되는 업데이트가 없습니다",
		majorUpdateDetected: "메이저 버전 업데이트가 감지되었습니다!",
		continueQuestion:
			"호환되지 않는 변경이 포함될 수 있습니다. 계속하시겠습니까?",
		majorSkipped: "({0}개 메이저 업데이트 건너뜀)",
		updateSafeOnly: "안전한 업데이트만",
		updateAllRisky: "모두 업데이트 (위험 포함)",
		majorFound:
			"브레이킹 체인지가 포함될 수 있는 {0}개의 메이저 업데이트를 발견했습니다:",
		statusBarUpToDate: "{0}개 패키지 최신 상태",
		statusBarUpdatesAvailable: "{0}개 업데이트 가능",
		statusBarTooltipUpToDate: "모든 패키지가 최신 상태입니다",
		statusBarTooltipUpdates:
			"{1}개 패키지 중 {0}개 업데이트 가능. 클릭하여 모두 업데이트.",
	},
	fr: {
		vulnerable: "{0} vulnérabilité(s) connue(s)",
		vulnerableTooltip:
			"Vulnérabilités connues dans {0} {1}. Cliquez pour ouvrir le rapport.",
		statusBarVulnerable: "{0} vulnérable(s)",
		updateTo: "Mettre à jour vers",
		upToDate: "À jour",
		latest: "dernière",
		updateAll: "Mettre à jour tous les paquets vers les dernières versions",
		updated: "Mis à jour",
		packages: "paquets vers les dernières versions",
		noUpdates: "Aucun paquet à mettre à jour",
		openRequirements:
			"Veuillez ouvrir un fichier requirements.txt ou pyproject.toml",
		checkFailed: "Échec de la vérification",
		checking: "Vérification",
		updateAnyway: "Mettre à jour quand même",
		noCompatible: "Aucune mise à jour compatible",
		majorUpdateDetected: "Mise à jour majeure détectée !",
		continueQuestion: "Cela peut inclure des changements cassants. Continuer ?",
		majorSkipped: "({0} mises à jour majeures ignorées)",
		updateSafeOnly: "Uniquement les mises à jour sûres",
		updateAllRisky: "Tout mettre à jour (y compris les risques)",
		majorFound:
			"Trouvé {0} mise(s) à jour majeure(s) pouvant inclure des changements cassants :",
		statusBarUpToDate: "{0} paquets à jour",
		statusBarUpdatesAvailable: "{0} mises à jour disponibles",
		statusBarTooltipUpToDate: "Tous les paquets sont à jour",
		statusBarTooltipUpdates:
			"{0} sur {1} paquets ont des mises à jour disponibles. Cliquez pour tout mettre à jour.",
	},
	de: {
		vulnerable: "{0} bekannte Schwachstelle(n)",
		vulnerableTooltip:
			"Bekannte Schwachstellen in {0} {1}. Klicken, um den Bericht zu öffnen.",
		statusBarVulnerable: "{0} anfällig",
		updateTo: "Aktualisieren auf",
		upToDate: "Aktuell",
		latest: "neueste",
		updateAll: "Alle Pakete auf neueste Versionen aktualisieren",
		updated: "Aktualisiert",
		packages: "Pakete auf neueste Versionen",
		noUpdates: "Keine Pakete zu aktualisieren",
		openRequirements:
			"Bitte öffnen Sie eine requirements.txt oder pyproject.toml Datei",
		checkFailed: "Überprüfung fehlgeschlagen",
		checking: "Überprüfen",
		updateAnyway: "Trotzdem aktualisieren",
		noCompatible: "Keine kompatible Aktualisierung",
		majorUpdateDetected: "Major-Update erkannt!",
		continueQuestion: "Kann Breaking Changes enthalten. Fortfahren?",
		majorSkipped: "({0} Major-Updates übersprungen)",
		updateSafeOnly: "Nur sichere Updates",
		updateAllRisky: "Alle aktualisieren (inklusive Risiko)",
		majorFound:
			"{0} Major-Updates gefunden, die bahnbrechende Änderungen enthalten können:",
		statusBarUpToDate: "{0} Pakete sind aktuell",
		statusBarUpdatesAvailable: "{0} Updates verfügbar",
		statusBarTooltipUpToDate: "Alle Pakete sind aktuell",
		statusBarTooltipUpdates:
			"{0} von {1} Paketen haben Updates. Klicken Sie, um alle zu aktualisieren.",
	},
	it: {
		vulnerable: "{0} vulnerabilità note",
		vulnerableTooltip:
			"Vulnerabilità note in {0} {1}. Clicca per aprire il report.",
		statusBarVulnerable: "{0} vulnerabile",
		updateTo: "Aggiorna a",
		upToDate: "Aggiornato",
		latest: "ultima",
		updateAll: "Aggiorna tutti i pacchetti alle ultime versioni",
		updated: "Aggiornato",
		packages: "pacchetti alle ultime versioni",
		noUpdates: "Nessun pacchetto da aggiornare",
		openRequirements: "Apri un file requirements.txt o pyproject.toml",
		checkFailed: "Controllo fallito",
		checking: "Controllo",
		updateAnyway: "Aggiorna comunque",
		noCompatible: "Nessun aggiornamento compatibile",
		majorUpdateDetected: "Rilevato aggiornamento principale!",
		continueQuestion: "Potrebbe includere modifiche incompatibili. Continuare?",
		majorSkipped: "({0} aggiornamenti principali ignorati)",
		updateSafeOnly: "Solo aggiornamenti sicuri",
		updateAllRisky: "Aggiorna tutto (inclusi rischi)",
		majorFound:
			"Trovati {0} aggiornamenti principali che potrebbero includere modifiche distruttive:",
		statusBarUpToDate: "{0} pacchetti aggiornati",
		statusBarUpdatesAvailable: "{0} aggiornamenti disponibili",
		statusBarTooltipUpToDate: "Tutti i pacchetti sono aggiornati",
		statusBarTooltipUpdates:
			"{0} di {1} pacchetti hanno aggiornamenti disponibili. Clicca per aggiornare tutto.",
	},
	es: {
		vulnerable: "{0} vulnerabilidad(es) conocida(s)",
		vulnerableTooltip:
			"Vulnerabilidades conocidas en {0} {1}. Haz clic para abrir el informe.",
		statusBarVulnerable: "{0} vulnerable",
		updateTo: "Actualizar a",
		upToDate: "Actualizado",
		latest: "última",
		updateAll: "Actualizar todos los paquetes a las últimas versiones",
		updated: "Actualizado",
		packages: "paquetes a las últimas versiones",
		noUpdates: "No hay paquetes para actualizar",
		openRequirements:
			"Por favor abra un archivo requirements.txt o pyproject.toml",
		checkFailed: "Comprobación fallida",
		checking: "Comprobando",
		updateAnyway: "Actualizar de todos modos",
		noCompatible: "No hay actualización compatible",
		majorUpdateDetected: "¡Actualización principal detectada!",
		continueQuestion:
			"Puede incluir cambios que rompen la compatibilidad. ¿Continuar?",
		majorSkipped: "({0} actualizaciones principales omitidas)",
		updateSafeOnly: "Solo actualizaciones seguras",
		updateAllRisky: "Actualizar todo (incluyendo riesgos)",
		majorFound:
			"Se encontraron {0} actualizaciones principales que pueden incluir cambios disruptivos:",
		statusBarUpToDate: "{0} paquetes actualizados",
		statusBarUpdatesAvailable: "{0} actualizaciones disponibles",
		statusBarTooltipUpToDate: "Todos los paquetes están actualizados",
		statusBarTooltipUpdates:
			"{0} de {1} paquetes tienen actualizaciones disponibles. Haga clic para actualizar todo.",
	},
	ru: {
		vulnerable: "Известных уязвимостей: {0}",
		vulnerableTooltip:
			"В {0} {1} есть известные уязвимости. Нажмите, чтобы открыть отчёт.",
		statusBarVulnerable: "Уязвимых: {0}",
		updateTo: "Обновить до",
		upToDate: "Актуально",
		latest: "последняя",
		updateAll: "Обновить все пакеты до последних версий",
		updated: "Обновлено",
		packages: "пакетов до последних версий",
		noUpdates: "Нет пакетов для обновления",
		openRequirements:
			"Пожалуйста, откройте файл requirements.txt или pyproject.toml",
		checkFailed: "Ошибка проверки",
		checking: "Проверка",
		updateAnyway: "Обновить в любом случае",
		noCompatible: "Нет совместимых обновлений",
		majorUpdateDetected: "Обнаружено мажорное обновление!",
		continueQuestion: "Могут содержаться критические изменения. Продолжить?",
		majorSkipped: "({0} мажорных обновлений пропущено)",
		updateSafeOnly: "Только безопасные обновления",
		updateAllRisky: "Обновить все (включая рискованные)",
		majorFound:
			"Найдено {0} мажорных обновлений, которые могут содержать критические изменения:",
		statusBarUpToDate: "{0} пакетов обновлено",
		statusBarUpdatesAvailable: "{0} обновлений доступно",
		statusBarTooltipUpToDate: "Все пакеты актуальны",
		statusBarTooltipUpdates:
			"{0} из {1} пакетов имеют обновления. Нажмите для обновления всех.",
	},
};

export function getLocale(overrideLanguage?: string): string {
	let locale = overrideLanguage;

	if (!locale) {
		try {
			locale = vscode.env.language;
		} catch (_e) {
			// vscode module might not be available in tests
			locale = "en";
		}
	}

	locale = (locale || "en").toLowerCase();

	// Handle specific locales
	if (messages[locale]) {
		return locale;
	}

	// Handle language families (e.g., zh-cn, zh-tw)
	const language = locale.split("-")[0];
	if (language === "zh") {
		return locale.includes("tw") || locale.includes("hk") ? "zh-tw" : "zh-cn";
	}

	// Generic fallback to language family if available (e.g. fr-ca -> fr)
	if (messages[language]) {
		return language;
	}

	// Fallback to English
	return "en";
}

export function t(key: keyof Messages, ...args: (string | number)[]): string {
	const locale = getLocale();
	let msg = messages[locale]?.[key] || messages.en[key];
	if (args.length > 0) {
		args.forEach((arg, i) => {
			msg = msg.replace(`{${i}}`, String(arg));
		});
	}
	return msg;
}
