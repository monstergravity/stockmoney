import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- Helper to get API key from localStorage ---
const getApiKey = () => localStorage.getItem('gemini_api_key');

// --- Stock Screener Components & Logic ---

interface RecommendedStock {
    name: string;
    ticker: string;
    exchange: string;
    score: number;
    thesis: string;
    keyMetrics: {
        grossMargin: string;
        peRatio: string;
    };
}

const screenerSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.STRING, description: "公司全称" },
            ticker: { type: Type.STRING, description: "股票代码" },
            exchange: { type: Type.STRING, description: "交易所, 例如：深交所, NASDAQ" },
            score: { type: Type.NUMBER, description: "综合评分 (1-100)，代表该股票与筛选标准的匹配程度" },
            thesis: { type: Type.STRING, description: "投资论点摘要，解释为何推荐该股票及其竞争优势" },
            keyMetrics: {
                type: Type.OBJECT,
                properties: {
                    grossMargin: { type: Type.STRING, description: "最新财报毛利率 (例如 '55.2%')" },
                    peRatio: { type: Type.STRING, description: "市盈率 TTM (例如 '约32倍')" }
                },
                required: ["grossMargin", "peRatio"]
            }
        },
        required: ["name", "ticker", "exchange", "score", "thesis", "keyMetrics"]
    }
};

const StockCard = ({ stock }: { stock: RecommendedStock }) => {
    const getScoreClass = (score: number) => {
        if (score >= 85) return 'high';
        if (score >= 60) return 'medium';
        return 'low';
    };

    return (
        <div className="stock-card">
            <div className="stock-card-header">
                <div className="stock-info">
                    <h3>{stock.name}</h3>
                    <p>{stock.ticker} · {stock.exchange}</p>
                </div>
                <div className={`stock-score ${getScoreClass(stock.score)}`}>
                    <span className="score-value">{stock.score}</span>
                    <span className="score-label">匹配分</span>
                </div>
            </div>
            <div className="investment-thesis">
                <h4>投资论点</h4>
                <p>{stock.thesis}</p>
            </div>
            <div className="key-metrics">
                <h4>关键指标</h4>
                <div className="metrics-grid">
                    <div className="metric-item">
                        <span>毛利率</span>
                        <strong>{stock.keyMetrics.grossMargin}</strong>
                    </div>
                    <div className="metric-item">
                        <span>市盈率 (TTM)</span>
                        <strong>{stock.keyMetrics.peRatio}</strong>
                    </div>
                </div>
            </div>
        </div>
    );
};

const StockScreener = () => {
    const [criteria, setCriteria] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [screenerResults, setScreenerResults] = useState<RecommendedStock[] | null>(null);
    
    const handleScreen = async () => {
        const apiKey = getApiKey();
        if (!apiKey) {
            setError('请先在“设置”页面中配置您的 Gemini API Key。');
            return;
        }
        if (!criteria.trim()) {
            setError('请输入您的选股标准。');
            return;
        }
        setLoading(true);
        setError('');
        setScreenerResults(null);

        try {
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `
                你是一位顶级的量化投资分析师。你的任务是根据用户提供的选股标准，精准地筛选出3-5只最符合的A股或美股市场的股票。

                **核心任务：** 你的评分逻辑必须严格量化。
                1.  **解析数值标准：** 首先，仔细解析用户输入的“选股标准”，识别出所有具体的数值要求，例如“毛利率高于50%”、“市盈率低于30倍”、“市值大于1000亿”等。
                2.  **量化匹配与评分：** 你的核心工作是根据这些数值标准来计算综合评分（1-100）。
                    -   如果一只股票完美满足或超越了所有数值标准（例如，用户要求毛利率 > 50%，而公司毛利率为65%），它应该获得非常高的基础分（例如85分以上）。
                    -   如果只是部分满足或接近标准（例如，用户要求市盈率 < 20，而公司市盈率为22），评分应相应降低。
                    -   除了数值标准外，再结合投资论点、竞争优势等定性因素，对基础分进行微调，得出最终的综合评分。
                3.  **结果输出：** 对于每一只股票，请提供其公司名称、股票代码、交易所、严格量化后的综合评分、解释其竞争优势的投资论点，以及最新的毛利率和市盈率TTM。

                **用户选股标准: "${criteria}"**

                请严格按照提供的JSON schema格式返回一个包含推荐股票的数组。所有内容必须使用简体中文。
            `;
            
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: screenerSchema,
                },
            });
            
            const resultText = response.text.trim();
            const resultData = JSON.parse(resultText) as RecommendedStock[];
            
            resultData.sort((a, b) => b.score - a.score);
            
            setScreenerResults(resultData);

        } catch (e) {
            console.error(e);
            setError('筛选失败。请检查您的API Key是否有效，调整您的标准或稍后重试。');
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="page-container">
            <header className="page-header">
                <h1><span className="icon">🔎</span>智能选股助手</h1>
                <p>描述您的理想投资组合，AI将为您发现潜力股</p>
            </header>
            <div className="search-form">
                <textarea
                    className="criteria-input"
                    value={criteria}
                    onChange={(e) => setCriteria(e.target.value)}
                    placeholder="例如：“毛利率在50%以上，拥有技术护城河，且市盈率合理的消费类公司”"
                    aria-label="选股标准输入"
                    rows={3}
                />
                <button onClick={handleScreen} disabled={loading} className="analyze-button">
                    {loading ? '筛选中...' : '开始筛选'}
                </button>
            </div>
            {loading && <div className="loader" aria-label="正在加载筛选结果"></div>}
            {error && <div className="error-message">{error}</div>}
            {screenerResults && (
                <div className="screener-results">
                    <h2>筛选结果</h2>
                    {screenerResults.map((stock) => (
                        <StockCard key={stock.ticker} stock={stock} />
                    ))}
                </div>
            )}
        </div>
    );
};

// --- Single Stock Analyzer Components & Logic ---
interface FinancialPeriod {
    period: string;
    revenue: { value: string; comment: string; };
    netProfit: { value: string; comment: string; };
    grossMargin: { value: string; comment: string; };
    peRatio: { value: string; comment: string; };
}

interface StockAnalysis {
    companyProfile: {
        name: string;
        ticker: string;
        exchange: string;
        industry: string;
        description: string;
    };
    financialSummary: FinancialPeriod[];
    swotAnalysis: {
        strengths: string[];
        weaknesses: string[];
        opportunities: string[];
        threats: string[];
    };
    investmentThesis: {
        bull: string;
        bear: string;
    };
    riskAnalysis: {
        rating: '高风险' | '中等风险' | '低风险';
        summary: string;
        keyFactors: string[];
    };
    conclusion: string;
}

const analysisSchema = {
    type: Type.OBJECT,
    properties: {
        companyProfile: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                ticker: { type: Type.STRING },
                exchange: { type: Type.STRING },
                industry: { type: Type.STRING },
                description: { type: Type.STRING },
            },
            required: ["name", "ticker", "exchange", "industry", "description"]
        },
        financialSummary: {
            type: Type.ARRAY,
            description: "包含多个财报周期的数组，必须包含最近一个完整财年和当前年度已公布的所有季度。",
            items: {
                type: Type.OBJECT,
                properties: {
                    period: { type: Type.STRING, description: "财报对应的周期, e.g., '2024年度', '2025年第一季度'" },
                    revenue: { type: Type.OBJECT, properties: { value: { type: Type.STRING }, comment: { type: Type.STRING } } },
                    netProfit: { type: Type.OBJECT, properties: { value: { type: Type.STRING }, comment: { type: Type.STRING } } },
                    grossMargin: { type: Type.OBJECT, properties: { value: { type: Type.STRING }, comment: { type: Type.STRING } } },
                    peRatio: { type: Type.OBJECT, properties: { value: { type: Type.STRING }, comment: { type: Type.STRING } } },
                },
                required: ["period", "revenue", "netProfit", "grossMargin", "peRatio"]
            }
        },
        swotAnalysis: {
            type: Type.OBJECT,
            properties: {
                strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
                threats: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["strengths", "weaknesses", "opportunities", "threats"]
        },
        investmentThesis: {
            type: Type.OBJECT,
            properties: {
                bull: { type: Type.STRING },
                bear: { type: Type.STRING },
            },
            required: ["bull", "bear"]
        },
        riskAnalysis: {
            type: Type.OBJECT,
            properties: {
                rating: { type: Type.STRING, enum: ['高风险', '中等风险', '低风险'] },
                summary: { type: Type.STRING },
                keyFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["rating", "summary", "keyFactors"]
        },
        conclusion: { type: Type.STRING }
    },
    required: ["companyProfile", "financialSummary", "swotAnalysis", "investmentThesis", "riskAnalysis", "conclusion"]
};


const ReportSection = ({ icon, title, children }: { icon: string, title: string, children: React.ReactNode }) => (
    <div className="report-card">
        <div className="section-header">
            <span className="section-icon">{icon}</span>
            <h3 className="section-title">{title}</h3>
        </div>
        <div className="section-content">
            {children}
        </div>
    </div>
);


const StockAnalyzer = () => {
    const [ticker, setTicker] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);

    const handleAnalyze = async () => {
        const apiKey = getApiKey();
        if (!apiKey) {
            setError('请先在“设置”页面中配置您的 Gemini API Key。');
            return;
        }
        if (!ticker.trim()) {
            setError('请输入股票代码。');
            return;
        }
        setLoading(true);
        setError('');
        setAnalysis(null);

        try {
            const ai = new GoogleGenAI({ apiKey });
            const prompt = `
                你是一位顶级的金融分析师。请为股票代码为 "${ticker}" 的公司生成一份专业的、深度综合分析报告。
                报告必须严格按照给定的JSON schema结构和要求输出，内容全面、数据精确、分析深刻。
                所有内容必须使用简体中文。

                报告需包含以下所有部分：
                1.  **公司概况 (companyProfile):** 公司全称、股票代码、交易所、所属行业板块，以及一段详细的公司业务描述。
                2.  **财务摘要 (financialSummary):**
                    -   **关键要求:** 此项必须为一个数组。你需要提供基于**最新可用财务报告**的数据。
                    -   **内容:** 数组应包含**最近一个完整财年**的年度数据，以及**当前年度所有已公布的季度**数据。
                    -   **示例:** 如果当前是2025年7月，且公司已发布Q2财报，则数组应包含 "2024年度"、"2025年第一季度" 和 "2025年第二季度" 三个周期的数据。
                    -   **字段:** 每个周期对象需包含：周期(period)，营业收入(revenue)，净利润(netProfit)，毛利率(grossMargin)和市盈率(peRatio)，并为每个指标提供数值和一句精炼的点评。
                3.  **SWOT分析 (swotAnalysis):** 优势、劣势、机会、威胁各至少3个关键点。
                4.  **投资论点 (investmentThesis):** 详细的看涨理由(bull)和看跌理由(bear)。
                5.  **风险分析 (riskAnalysis):** 综合风险评级(rating), 风险摘要(summary), 和至少3个主要风险因素(keyFactors)。
                6.  **综合结论 (conclusion):** 一段总结性的最终结论。
            `;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: analysisSchema,
                },
            });

            const resultData = JSON.parse(response.text.trim()) as StockAnalysis;
            setAnalysis(resultData);

        } catch (e) {
            console.error(e);
            setError('分析失败。请检查您的API Key是否有效、股票代码是否正确，或稍后重试。');
        } finally {
            setLoading(false);
        }
    };

    const getRiskClass = (rating: string) => {
        if (rating === '高风险') return 'risk-high';
        if (rating === '中等风险') return 'risk-medium';
        if (rating === '低风险') return 'risk-low';
        return '';
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <h1><span className="icon">📊</span>个股深度分析</h1>
                <p>输入股票代码，获取 AI 生成的全面分析报告</p>
            </header>
            <div className="search-form">
                 <input
                    type="text"
                    className="criteria-input"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    placeholder="例如：AAPL, 300750.SZ"
                    aria-label="股票代码输入"
                />
                <button onClick={handleAnalyze} disabled={loading} className="analyze-button">
                    {loading ? '分析中...' : '生成报告'}
                </button>
            </div>
             {loading && <div className="loader" aria-label="正在加载分析结果"></div>}
            {error && <div className="error-message">{error}</div>}
            {analysis && (
                <div className="analysis-report-container">
                    <h2 className="report-title">个股综合分析报告</h2>
                    <p className="report-subtitle">由 Gemini AI 生成</p>

                    <ReportSection icon="🏢" title="公司概况">
                        <div className="company-profile-header">
                            <div>
                                <div className="company-name">{analysis.companyProfile.name}</div>
                                <div className="company-meta">{analysis.companyProfile.ticker}</div>
                            </div>
                             <div>
                                <div className="company-label">交易所</div>
                                <div className="company-value">{analysis.companyProfile.exchange}</div>
                            </div>
                             <div>
                                <div className="company-label">行业板块</div>
                                <div className="company-value">{analysis.companyProfile.industry}</div>
                            </div>
                        </div>
                        <p className="company-description">{analysis.companyProfile.description}</p>
                    </ReportSection>
                    
                    <ReportSection icon="💹" title="财务摘要">
                        {analysis.financialSummary.map((summary, index) => (
                            <div key={index} className="financial-period">
                                <h4 className="financial-period-title">{summary.period}</h4>
                                <div className="financial-summary-grid">
                                    <div className="financial-metric">
                                        <h5>营收</h5>
                                        <p className="financial-value">{summary.revenue.value}</p>
                                        <p className="financial-comment">{summary.revenue.comment}</p>
                                    </div>
                                    <div className="financial-metric">
                                        <h5>净利润</h5>
                                        <p className="financial-value">{summary.netProfit.value}</p>
                                        <p className="financial-comment">{summary.netProfit.comment}</p>
                                    </div>
                                    <div className="financial-metric">
                                        <h5>毛利率</h5>
                                        <p className="financial-value">{summary.grossMargin.value}</p>
                                        <p className="financial-comment">{summary.grossMargin.comment}</p>
                                    </div>
                                    <div className="financial-metric">
                                        <h5>市盈率 (TTM)</h5>
                                        <p className="financial-value">{summary.peRatio.value}</p>
                                        <p className="financial-comment">{summary.peRatio.comment}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </ReportSection>


                    <ReportSection icon="🧭" title="SWOT 分析">
                        <div className="swot-grid">
                            <div className="swot-item swot-s">
                                <h4>优势 (S)</h4>
                                <ul>{analysis.swotAnalysis.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                            </div>
                            <div className="swot-item swot-w">
                                <h4>劣势 (W)</h4>
                                <ul>{analysis.swotAnalysis.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
                            </div>
                            <div className="swot-item swot-o">
                                <h4>机会 (O)</h4>
                                <ul>{analysis.swotAnalysis.opportunities.map((o, i) => <li key={i}>{o}</li>)}</ul>
                            </div>
                            <div className="swot-item swot-t">
                                <h4>威胁 (T)</h4>
                                <ul>{analysis.swotAnalysis.threats.map((t, i) => <li key={i}>{t}</li>)}</ul>
                            </div>
                        </div>
                    </ReportSection>

                    <ReportSection icon="💡" title="投资论点">
                        <div className="thesis-item">
                            <h4>看涨理由 (Bull) 👍</h4>
                            <p>{analysis.investmentThesis.bull}</p>
                        </div>
                         <div className="thesis-item">
                            <h4>看跌理由 (Bear) 👎</h4>
                            <p>{analysis.investmentThesis.bear}</p>
                        </div>
                    </ReportSection>

                    <ReportSection icon="⚠️" title="风险分析">
                        <div className="risk-summary">
                            <strong>综合风险评级：</strong> 
                            <span className={`risk-rating ${getRiskClass(analysis.riskAnalysis.rating)}`}>
                                {analysis.riskAnalysis.rating}
                            </span>
                        </div>
                        <p>{analysis.riskAnalysis.summary}</p>
                        <h4 className="risk-factors-title">主要风险因素：</h4>
                        <ul>{analysis.riskAnalysis.keyFactors.map((f, i) => <li key={i}>{f}</li>)}</ul>
                    </ReportSection>

                    <ReportSection icon="🎯" title="综合结论">
                        <p>{analysis.conclusion}</p>
                    </ReportSection>
                </div>
            )}
        </div>
    );
};

// --- Settings Page ---

const SettingsPage = () => {
    const [apiKey, setApiKey] = useState('');
    const [saveMessage, setSaveMessage] = useState('');

    useEffect(() => {
        const storedKey = getApiKey();
        if (storedKey) {
            setApiKey(storedKey);
        }
    }, []);

    const handleSave = () => {
        localStorage.setItem('gemini_api_key', apiKey);
        setSaveMessage('API 密钥已成功保存！');
        setTimeout(() => setSaveMessage(''), 3000);
    };
    
    return (
        <div className="page-container info-page">
            <header className="page-header">
                <h1><span className="icon">🔑</span>API 密钥设置</h1>
            </header>
            <div className="info-content">
                <p>本应用需要您自己的 Google Gemini API 密钥才能运行。请按照以下步骤获取并保存您的密钥。</p>
                <ol>
                    <li>访问 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a> 并创建一个新的 API 密钥。</li>
                    <li>将您的密钥复制并粘贴到下方的输入框中。</li>
                    <li>点击“保存密钥”。您的密钥将安全地存储在您的浏览器中，不会被发送到任何服务器。</li>
                </ol>
                <div className="api-key-form">
                    <input 
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="在此处粘贴您的 Gemini API Key"
                        className="criteria-input"
                    />
                    <button onClick={handleSave} className="analyze-button">保存密钥</button>
                </div>
                {saveMessage && <div className="save-message">{saveMessage}</div>}
            </div>
        </div>
    );
};


// --- Training Page ---
const TrainingPage = () => {
    return (
         <div className="page-container info-page">
            <header className="page-header">
                <h1><span className="icon">🎓</span>使用教程</h1>
            </header>
            <div className="info-content">
                <div className="training-section">
                    <h3>如何使用智能选股助手</h3>
                    <p>在输入框中，用自然语言描述您的选股标准。AI 的理解能力很强，您可以像和投资专家对话一样提问。</p>
                    <p><strong>为了获得最佳结果，请尽量具体：</strong></p>
                    <ul>
                        <li><strong>量化指标：</strong> "毛利率高于60%"，"市盈率低于20倍"，"连续3年营收增长超过20%"</li>
                        <li><strong>定性描述：</strong> "拥有强大的品牌护城河"，"处于高增长的赛道"，"管理层优秀"</li>
                        <li><strong>组合示例：</strong> "筛选出在半导体行业，毛利率高于50%，并且具有技术领先优势的公司。"</li>
                    </ul>
                </div>
                 <div className="training-section">
                    <h3>如何使用个股深度分析</h3>
                    <p>这是一个更直接的工具。只需在输入框中输入您感兴趣的股票代码即可。</p>
                     <p><strong>支持的市场格式示例：</strong></p>
                     <ul>
                        <li><strong>A股:</strong> 600519.SH, 300750.SZ</li>
                        <li><strong>美股:</strong> AAPL, NVDA</li>
                        <li><strong>港股:</strong> 00700.HK</li>
                     </ul>
                    <p>AI 将会生成一份包含公司概况、财务摘要、SWOT分析、投资论点和风险分析的全面报告。</p>
                </div>
            </div>
        </div>
    );
};

// --- Footer Component ---
const Footer = () => (
    <footer className="app-footer">
        <p>公众号“stock money”</p>
        <p className="disclaimer">
            免责声明：本应用生成的所有内容均由 AI 模型提供，仅供学习和研究之用，不构成任何投资建议。请在做出任何投资决策前，进行独立研究并咨询专业人士。
        </p>
    </footer>
);


// --- Main App Component with Router ---
type Page = 'screener' | 'analyzer' | 'settings' | 'training';

const App = () => {
    const [page, setPage] = useState<Page>('screener');

    const renderPage = () => {
        switch (page) {
            case 'screener': return <StockScreener />;
            case 'analyzer': return <StockAnalyzer />;
            case 'settings': return <SettingsPage />;
            case 'training': return <TrainingPage />;
            default: return <StockScreener />;
        }
    };

    return (
        <div className="container">
            <nav className="app-nav">
                <button onClick={() => setPage('screener')} className={page === 'screener' ? 'active' : ''}>智能选股</button>
                <button onClick={() => setPage('analyzer')} className={page === 'analyzer' ? 'active' : ''}>个股分析</button>
                <button onClick={() => setPage('training')} className={page === 'training' ? 'active' : ''}>使用教程</button>
                <button onClick={() => setPage('settings')} className={page === 'settings' ? 'active' : ''}>设置</button>
            </nav>
            <main>
                {renderPage()}
            </main>
            <Footer />
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);