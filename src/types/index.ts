export interface ExtractedData {
  name: string;
  number: string;
  date: string;
  company: string;
  status: string;
  user: string;
  [key: string]: string;
}

export interface Config {
  telegram: {
    token: string;
    hourlyCheckChatId: number;
    hourlyMessage: string;
  };
  gemini: {
    apiKey: string;
  };
  website: {
    loginUrl: string;
    dataUrl: string;
    username: string;
    password: string;
  };
  defaultValues: {
    name: string;
    number: string;
    company: string;
    date: string;
    status: string;
    user: string;
  };
  server: {
    port: number;
  };
}

export interface WebsiteLoginResponse {
  jwt: string;
  [key: string]: any;
}

export interface WebsiteDataResponse {
  [key: string]: any;
}
