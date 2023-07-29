import onecase
import pandas as pd
import json
from importlib import reload
reload(onecase)

class OneCase(onecase.OneCaseABC):
    def __init__(self, inpfile, unitconv = 1, ignored_materials=[]):
        onecase.OneCaseABC.__init__(self, unitconv=unitconv, ignored_materials=ignored_materials)
        with open(inpfile, 'r') as f:
            self.inp = json.loads(f.read())
    
    @property
    def df_material(self):
        return self.inp['i']

    @property
    def df_process(self):
        return self.inp['j']

    @property
    def df_iom(self):
        return self.inp['a']

    @property
    def df_demand(self):
        if self._df_demand is None:
            df = pd.DataFrame.from_dict(self.inp['demand'], orient='index', columns=['demand'])
            df.index.name = 'material'
            self._df_demand = df
        return self._df_demand

    @property
    def df_supply(self):
        if self._df_supply is None:
            df = pd.DataFrame.from_dict(self.inp['supply'], orient='index', columns=['supply'])
            df.index.name = 'material'
            self._df_supply = df
        return self._df_supply

    @property
    def df_unconstrained_raw(self):
        if self._df_unconstrained_raw is None:
            df = pd.DataFrame([], index=pd.Index(self.inp['unconstrained_raw']))
            self._df_unconstrained_raw = df
        return self._df_unconstrained_raw

    @property
    def df_pgrp(self):
        pass

    @property
    def df_pgrp_defs(self):
        pass

    @property
    def df_flux(self):
        if self._df_flux is None:
            self._mk_flux()
        return self._df_flux

    @property
    def df_flux_byproc(self):
        if self._df_flux_byproc is None:
            self._mk_flux_byproc()
        return self._df_flux_byproc

    @property
    def df_edges(self):
        if self._df_edges is None:
            self._mk_edges()
        return self._df_edges

    @property
    def df_edges_byproc(self):
        if self._df_edges_byproc is None:
            self._mk_edges()
        return self._df_edges_byproc

    @property
    def df_thru(self):
        if self._df_thru is None:
            dct = self.inp['throughput']
            dat = []
            for mat, v in dct.items():
                for proc, vv in v.items():
                    dat.append([mat, proc, vv])
            df = pd.DataFrame(dat, columns=['material', 'process', 'thru']).set_index(['material', 'process'])
            self._df_thru = df


        return self._df_thru


    @property
    def df_net_prod(self):
        return self.inp['net_cons']

    @property
    def df_gross_prod(self):
        if self._df_gross_prod is None:
            df = pd.DataFrame.from_dict(self.inp['gross_prod'], orient='index', columns=['gross_prod'])
            df.index.name = 'material'
            self._df_gross_prod = df

        return self._df_gross_prod
    @property
    def df_gross_cons(self):
        if self._df_gross_cons is None:
            df = pd.DataFrame.from_dict(self.inp['gross_cons'], orient='index', columns=['gross_cons'])
            df.index.name = 'material'
            self._df_gross_cons = df

        return self._df_gross_cons

